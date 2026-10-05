/**
 * Service Quản lý Kỳ thi (Exam Service).
 * Xử lý các nghiệp vụ: Đề xuất kỳ thi, Gửi duyệt, Phê duyệt/Từ chối, Xuất bản kỳ thi (Publish) và Lưu trữ (Archive).
 */

import mongoose from 'mongoose';
import { Exam, Topic, Department, Question, ExamCandidate, ExamAttempt } from '../models/index.js';
import { EXAM_STATUS, QUESTION_USAGE, ATTEMPT_TYPE, ATTEMPT_STATUS } from '../models/constants.js';
import { questionUsageFilter } from '../models/question.model.js';
import { ApiError } from '../utils/api-error.js';
import {
  generateExamCodesAndAssignCandidates,
  assertExamPublishable,
  assertScopeQuestionsSufficient,
} from './exam-code-generation.service.js';
import { notificationService } from './notification.service.js';

// ───────────── Chống xung đột khi nhiều người thao tác cùng lúc ─────────────
// Mọi bước chuyển trạng thái đều là MỘT lệnh findOneAndUpdate có điều kiện trạng thái (nguyên tử): chỉ đúng 1 request thắng,
// các request còn lại nhận lỗi rõ ràng và KHÔNG ghi thông báo / audit log. Không còn kiểu "đọc -> kiểm tra -> save()" dễ bị ghi đè.
const PUBLISH_LOCK_TTL_MS = 10 * 60 * 1000;

// Thí sinh được coi là "đang làm bài" nếu lượt thi chính thức còn in_progress, chưa hết giờ và có hoạt động trong khoảng này
// (bằng INACTIVITY_TIMEOUT_MS trong exam-attempt.service.js: rời ca thi quá 1 phút thì hệ thống tự nộp, nên không tính là đang thi).
const ACTIVE_ATTEMPT_WINDOW_MS = 60_000;

// Đếm thí sinh đang làm bài ở (các) kỳ thi đang published, trừ kỳ thi `excludeExamId`.
// Đăng kỳ thi mới sẽ lưu trữ các kỳ thi này; khi đó autosave/heartbeat/nộp bài của họ không còn tìm thấy kỳ thi đang mở.
async function getActiveAttemptImpact(excludeExamId) {
  const currentExams = await Exam.find({ status: EXAM_STATUS.PUBLISHED, _id: { $ne: excludeExamId } })
    .select('title')
    .lean();
  if (currentExams.length === 0) return { activeAttemptCount: 0, currentExams: [] };

  const candidateIds = await ExamCandidate.find({ examId: { $in: currentExams.map((e) => e._id) } }).distinct('_id');
  const now = Date.now();
  const activeAttemptCount = candidateIds.length
    ? await ExamAttempt.countDocuments({
        examCandidateId: { $in: candidateIds },
        attemptType: ATTEMPT_TYPE.OFFICIAL,
        status: ATTEMPT_STATUS.IN_PROGRESS,
        expiresAt: { $gt: new Date(now) },
        $or: [{ lastActiveAt: null }, { lastActiveAt: { $gte: new Date(now - ACTIVE_ATTEMPT_WINDOW_MS) } }],
      })
    : 0;

  return {
    activeAttemptCount,
    currentExams: currentExams.map((e) => ({ _id: e._id, title: e.title })),
  };
}

// Điều kiện "chưa ai đang phát hành đề này" (không có khóa, hoặc khóa đã quá hạn).
function publishLockFree() {
  return {
    $or: [{ publishLockedAt: null }, { publishLockedAt: { $lt: new Date(Date.now() - PUBLISH_LOCK_TTL_MS) } }],
  };
}

// Dựng lỗi phù hợp khi cập nhật có điều kiện không khớp bản ghi nào.
// - Không tồn tại                      -> 404
// - Đã sang trạng thái khác            -> 400 EXAM_INVALID_STATUS (client đã có sẵn xử lý "dữ liệu cũ" cho mã này)
// - Vẫn đúng trạng thái nhưng bị chặn  -> 409 (đang có người phát hành đề này / đề vừa bị thay đổi ở nơi khác)
async function buildTransitionError(examId, expectedStatuses, invalidMessage) {
  const current = await Exam.findById(examId).select('status publishLockedAt').lean();
  if (!current) return new ApiError(404, 'Không tìm thấy kỳ thi', 'EXAM_NOT_FOUND');
  if (!expectedStatuses.includes(current.status)) {
    return new ApiError(400, invalidMessage, 'EXAM_INVALID_STATUS');
  }
  const lockedAt = current.publishLockedAt ? new Date(current.publishLockedAt).getTime() : 0;
  if (lockedAt && Date.now() - lockedAt < PUBLISH_LOCK_TTL_MS) {
    return new ApiError(
      409,
      'Kỳ thi này đang được một Người duyệt đề khác đăng chính thức. Vui lòng đợi hoàn tất rồi tải lại danh sách.',
      'EXAM_PUBLISH_IN_PROGRESS',
    );
  }
  return new ApiError(
    409,
    'Kỳ thi vừa được thay đổi ở nơi khác. Vui lòng tải lại danh sách rồi thử lại.',
    'EXAM_CONFLICT',
  );
}

// Bước cuối của phát hành: chuyển kỳ thi cũ (nếu có) sang lưu trữ rồi đặt kỳ thi này thành published.
// Index duy nhất 'uniq_single_published_exam' đảm bảo không bao giờ có 2 kỳ thi published; nếu 2 kỳ thi khác nhau được đăng
// sát nhau thì kỳ thi sau lưu trữ kỳ thi trước (đúng nghiệp vụ "đăng mới đè đăng cũ") và thử lại.
async function finalizePublish(examId, lockToken) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await Exam.updateMany(
      { status: EXAM_STATUS.PUBLISHED, _id: { $ne: examId } },
      { $set: { status: EXAM_STATUS.ARCHIVED }, $inc: { __v: 1 } },
    );
    try {
      const published = await Exam.findOneAndUpdate(
        { _id: examId, status: EXAM_STATUS.APPROVED, publishLockedAt: lockToken },
        {
          $set: { status: EXAM_STATUS.PUBLISHED, publishedAt: new Date() },
          $unset: { publishLockedAt: 1 },
          $inc: { __v: 1 },
        },
        { new: true },
      );
      if (!published) {
        throw await buildTransitionError(examId, [EXAM_STATUS.APPROVED], 'Kỳ thi không còn ở trạng thái chờ phát hành');
      }
      return published;
    } catch (err) {
      if (err?.code === 11000) continue; // vừa có kỳ thi khác được đăng -> lưu trữ nó rồi thử lại
      throw err;
    }
  }
  throw new ApiError(
    409,
    'Đang có kỳ thi khác được đăng chính thức cùng lúc. Vui lòng tải lại danh sách rồi thử lại.',
    'EXAM_PUBLISH_CONFLICT',
  );
}

// MỚI — Chủ đề dùng để ra đề phải có ít nhất 1 câu hỏi THI CHÍNH THỨC đang hoạt động. Câu ở ngân hàng Ôn tập không bao giờ
// được rút vào đề (xem questionUsageFilter), nên chủ đề chỉ có câu Ôn tập không thể tạo thành đề thi. Chặn từ lúc tạo/đổi chủ đề
// ở phía server, không chỉ dựa vào việc ẩn chủ đề trong form.
async function assertTopicHasExamQuestions(topicId, topicName) {
  const examCount = await Question.countDocuments({
    topicId,
    isActive: true,
    ...questionUsageFilter(QUESTION_USAGE.EXAM),
  });
  if (examCount === 0) {
    throw new ApiError(
      400,
      `Chủ đề "${topicName}" chưa có câu hỏi thi chính thức nào (câu thuộc ngân hàng Ôn tập không được dùng để ra đề). ` +
        'Vui lòng chọn chủ đề khác hoặc chuyển câu hỏi sang ngân hàng Thi chính thức.',
      'TOPIC_NO_EXAM_QUESTIONS',
    );
  }
}

// MỚI — Chuẩn hoá và kiểm tra phạm vi phòng ban từ payload client.
async function parseDepartmentScopeFields(payload) {
  const rawScope = payload.departmentScope;
  const departmentScope = rawScope === 'selected' ? 'selected' : 'all';

  if (departmentScope === 'all') {
    return { departmentScope: 'all', allowedDepartmentIds: undefined };
  }

  const rawIds = payload.allowedDepartmentIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    throw new ApiError(
      400,
      'Khi chọn phạm vi theo từng phòng ban, cần chọn ít nhất một phòng ban.',
      'EXAM_SCOPE_INVALID',
    );
  }

  const allowedDepartmentIds = [];
  for (const raw of rawIds) {
    const idStr = String(raw);
    if (!mongoose.isValidObjectId(idStr)) {
      throw new ApiError(400, 'Danh sách phòng ban được thi có ID không hợp lệ.', 'EXAM_SCOPE_INVALID');
    }
    allowedDepartmentIds.push(new mongoose.Types.ObjectId(idStr));
  }

  const activeCount = await Department.countDocuments({
    _id: { $in: allowedDepartmentIds },
    isActive: true,
  });
  if (activeCount !== allowedDepartmentIds.length) {
    throw new ApiError(
      400,
      'Danh sách phòng ban được thi có phòng không tồn tại hoặc đã ngừng hoạt động.',
      'EXAM_SCOPE_INVALID',
    );
  }

  return { departmentScope: 'selected', allowedDepartmentIds };
}

export const examService = {
  // Lấy danh sách kỳ thi theo bộ lọc (trạng thái, người tạo, chủ đề)
  async listExams(filters = {}) {
    const { status, createdBy, topicId } = filters;
    const query = {};
    if (status) query.status = status;
    if (createdBy) query.createdBy = createdBy;
    if (topicId) query.topicId = topicId;

    const exams = await Exam.find(query)
      .populate('topicId', 'name')
      .populate('allowedDepartmentIds', 'name code')
      .populate('createdBy', 'username fullName')
      .populate('approvedBy', 'username fullName')
      .sort({ createdAt: -1 })
      .lean();

    return exams;
  },

  // Examiner tạo bản thảo đề xuất kỳ thi mới (DRAFT)
  async createExamProposal(payload, userId) {
    const {
      title,
      topicId,
      durationMinutes,
      totalQuestions,
      commonQuestionCount,
      departmentQuestionCount,
      passThresholdPercent,
      allowCommonCompensation,
    } = payload;

    const topic = await Topic.findById(topicId);
    if (!topic) throw new ApiError(404, 'Không tìm thấy chủ đề', 'TOPIC_NOT_FOUND');
    await assertTopicHasExamQuestions(topic._id, topic.name);

    const scopeFields = await parseDepartmentScopeFields(payload);
    const allowComp = allowCommonCompensation === true;

    await assertScopeQuestionsSufficient({
      topicId,
      departmentQuestionCount,
      allowCommonCompensation: allowComp,
      departmentScope: scopeFields.departmentScope,
      allowedDepartmentIds: scopeFields.allowedDepartmentIds,
    });

    const exam = new Exam({
      title,
      topicId,
      durationMinutes,
      totalQuestions,
      commonQuestionCount,
      departmentQuestionCount,
      passThresholdPercent,
      // MỚI — Công tắc bù câu chung: luôn ghi giá trị rõ ràng; client không gửi thì mặc định TẮT (công bằng)
      allowCommonCompensation: allowComp,
      departmentScope: scopeFields.departmentScope,
      allowedDepartmentIds: scopeFields.allowedDepartmentIds,
      createdBy: userId,
      status: EXAM_STATUS.DRAFT,
    });
    await exam.save();
    return exam;
  },

  // MỚI — Examiner sửa lại đề xuất của chính mình (áp dụng cho đề đang ở
  // trạng thái draft hoặc rejected — cùng điều kiện với submitExamForReview).
  // Sau khi sửa, đề TỰ ĐỘNG quay về draft (kể cả khi đang rejected) và xoá
  // rejectionReason cũ — vì nội dung đã đổi, lý do từ chối trước đó không
  // còn phản ánh đúng đề hiện tại nữa. Examiner cần bấm "Gửi duyệt" lại như
  // bình thường sau khi sửa, KHÔNG tự động gửi duyệt ngay trong hàm này —
  // để họ có cơ hội xem lại lần cuối trước khi gửi.
  async updateExamProposal(examId, payload, userId) {
    const exam = await Exam.findOne({ _id: examId, createdBy: userId });
    if (!exam) throw new ApiError(404, 'Không tìm thấy kỳ thi', 'EXAM_NOT_FOUND');

    if (![EXAM_STATUS.DRAFT, EXAM_STATUS.REJECTED].includes(exam.status)) {
      throw new ApiError(400, 'Kỳ thi không ở trạng thái hợp lệ để chỉnh sửa', 'EXAM_INVALID_STATUS');
    }

    const {
      title,
      topicId,
      durationMinutes,
      totalQuestions,
      commonQuestionCount,
      departmentQuestionCount,
      passThresholdPercent,
      allowCommonCompensation,
      departmentScope,
    } = payload;

    if (topicId && String(topicId) !== String(exam.topicId)) {
      const topic = await Topic.findById(topicId);
      if (!topic) throw new ApiError(404, 'Không tìm thấy chủ đề', 'TOPIC_NOT_FOUND');
      // Chỉ kiểm tra khi ĐỔI sang chủ đề khác (sửa đề giữ nguyên chủ đề cũ thì không chặn, tránh khóa đề đang soạn dở)
      await assertTopicHasExamQuestions(topic._id, topic.name);
    }

    exam.title = title;
    exam.topicId = topicId;
    exam.durationMinutes = durationMinutes;
    exam.totalQuestions = totalQuestions;
    exam.commonQuestionCount = commonQuestionCount;
    exam.departmentQuestionCount = departmentQuestionCount;
    exam.passThresholdPercent = passThresholdPercent;
    // MỚI — Chỉ cập nhật công tắc khi client có gửi (kỳ thi cũ chưa có field sẽ giữ nguyên hành vi bù nếu không gửi).
    if (typeof allowCommonCompensation === 'boolean') {
      exam.allowCommonCompensation = allowCommonCompensation;
    }
    if (departmentScope === 'selected' || departmentScope === 'all') {
      const scopeFields = await parseDepartmentScopeFields(payload);
      exam.departmentScope = scopeFields.departmentScope;
      exam.allowedDepartmentIds = scopeFields.allowedDepartmentIds;
    } else if (payload.allowedDepartmentIds !== undefined && exam.departmentScope === 'selected') {
      const scopeFields = await parseDepartmentScopeFields({ ...payload, departmentScope: 'selected' });
      exam.allowedDepartmentIds = scopeFields.allowedDepartmentIds;
    }

    await assertScopeQuestionsSufficient({
      topicId: exam.topicId,
      departmentQuestionCount: exam.departmentQuestionCount,
      allowCommonCompensation: exam.allowCommonCompensation,
      departmentScope: exam.departmentScope,
      allowedDepartmentIds: exam.allowedDepartmentIds,
    });

    exam.status = EXAM_STATUS.DRAFT;
    exam.rejectionReason = undefined;

    try {
      await exam.save();
    } catch (err) {
      // Đề vừa bị thao tác khác thay đổi (vd nộp duyệt từ tab khác) trong lúc đang sửa -> không ghi đè lặng lẽ.
      if (err?.name === 'VersionError') {
        throw new ApiError(
          409,
          'Đề xuất vừa được thay đổi ở nơi khác (có thể đã được gửi duyệt từ tab hoặc thiết bị khác). Vui lòng tải lại danh sách rồi thử lại.',
          'EXAM_CONFLICT',
        );
      }
      throw err;
    }
    return exam;
  },

  // Examiner gửi duyệt đề xuất kỳ thi -> Chuyển trạng thái sang PENDING_REVIEW và bắn thông báo tới Leader
  async submitExamForReview(examId, userId) {
    const exam = await Exam.findOne({ _id: examId, createdBy: userId });
    if (!exam) throw new ApiError(404, 'Không tìm thấy kỳ thi', 'EXAM_NOT_FOUND');

    if (![EXAM_STATUS.DRAFT, EXAM_STATUS.REJECTED].includes(exam.status)) {
      throw new ApiError(400, 'Kỳ thi không ở trạng thái hợp lệ để gửi duyệt', 'EXAM_INVALID_STATUS');
    }

    // MỚI — Kiểm tra sớm: thiếu câu hỏi (chung hoặc riêng theo công tắc bù) thì chặn ngay lúc gửi duyệt,
    // không đợi tới khi Người duyệt đề bấm Đăng chính thức. Lúc công bố hệ thống vẫn kiểm tra lại.
    const warnings = await assertExamPublishable(exam);

    // Nguyên tử: chỉ chuyển được khi đề VẪN đang draft/rejected và CHƯA bị sửa kể từ lúc kiểm tra ở trên (khớp __v).
    // Hai lần nộp đồng thời -> chỉ 1 lần thắng, lần còn lại không tạo thông báo trùng cho Leader.
    const submitted = await Exam.findOneAndUpdate(
      {
        _id: exam._id,
        createdBy: userId,
        status: { $in: [EXAM_STATUS.DRAFT, EXAM_STATUS.REJECTED] },
        __v: exam.__v,
      },
      { $set: { status: EXAM_STATUS.PENDING_REVIEW }, $inc: { __v: 1 } },
      { new: true },
    );
    if (!submitted) {
      throw await buildTransitionError(
        exam._id,
        [EXAM_STATUS.DRAFT, EXAM_STATUS.REJECTED],
        'Kỳ thi không ở trạng thái hợp lệ để gửi duyệt',
      );
    }

    try {
      await notificationService.notifyExamSubmitted(submitted);
    } catch (err) {
      console.error('notifyExamSubmitted failed:', err);
    }

    const result = submitted.toObject();
    if (warnings) result.warnings = warnings;
    return result;
  },

  // Leader phê duyệt kỳ thi (APPROVED) và ấn định khung thời gian thi
  async approveExam(examId, { startDate, endDate }, leaderId) {
    if (!startDate || !endDate) {
      throw new ApiError(400, 'Vui lòng cung cấp ngày bắt đầu và kết thúc', 'EXAM_DATES_REQUIRED');
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      throw new ApiError(400, 'Ngày kết thúc phải sau ngày bắt đầu', 'EXAM_DATES_INVALID');
    }

    // Nguyên tử: chỉ 1 Người duyệt đề thắng khi nhiều người cùng bấm; người đến sau nhận EXAM_INVALID_STATUS.
    const exam = await Exam.findOneAndUpdate(
      { _id: examId, status: EXAM_STATUS.PENDING_REVIEW },
      {
        $set: {
          status: EXAM_STATUS.APPROVED,
          startDate: start,
          endDate: end,
          approvedBy: leaderId,
          approvedAt: new Date(),
        },
        $inc: { __v: 1 },
      },
      { new: true },
    );
    if (!exam) {
      throw await buildTransitionError(examId, [EXAM_STATUS.PENDING_REVIEW], 'Kỳ thi không ở trạng thái chờ duyệt');
    }

    try {
      await notificationService.notifyExamApproved(exam);
    } catch (err) {
      console.error('notifyExamApproved failed:', err);
    }

    return exam;
  },

  // Leader từ chối đề xuất kỳ thi (REJECTED) kèm lý do
  async rejectExam(examId, rejectionReason, leaderId) {
    if (!rejectionReason?.trim()) {
      throw new ApiError(400, 'Vui lòng cung cấp lý do từ chối', 'REASON_REQUIRED');
    }

    // Nguyên tử: duyệt và từ chối cùng lúc -> chỉ 1 bên thắng, không còn trạng thái lẫn lộn (rejected nhưng còn lịch thi...).
    const exam = await Exam.findOneAndUpdate(
      { _id: examId, status: EXAM_STATUS.PENDING_REVIEW },
      {
        $set: { status: EXAM_STATUS.REJECTED, rejectionReason, approvedBy: leaderId },
        $inc: { __v: 1 },
      },
      { new: true },
    );
    if (!exam) {
      throw await buildTransitionError(examId, [EXAM_STATUS.PENDING_REVIEW], 'Kỳ thi không ở trạng thái chờ duyệt');
    }

    try {
      await notificationService.notifyExamRejected(exam);
    } catch (err) {
      console.error('notifyExamRejected failed:', err);
    }

    return exam;
  },

  // Công bố kỳ thi chính thức (PUBLISHED): Sinh các bộ mã đề thi, gán thí sinh và lưu trữ kỳ thi cũ.
  // Phát hành có KHÓA theo từng kỳ thi (publishLockedAt): chỉ 1 người được phát hành cùng lúc, người đến sau nhận
  // EXAM_PUBLISH_IN_PROGRESS (hoặc EXAM_INVALID_STATUS nếu đề đã được đăng xong). Nếu lỗi giữa chừng, khóa được gỡ để bấm lại
  // an toàn (việc gán thí sinh vốn idempotent theo từng nhân viên).
  // Có thí sinh đang làm bài ở kỳ thi đang diễn ra -> từ chối (409 EXAM_PUBLISH_ACTIVE_ATTEMPTS) trừ khi { force: true }
  // (client chỉ gửi force sau khi Người duyệt đề xác nhận lần 2).
  async publishExam(examId, leaderId, { force = false } = {}) {
    const lockToken = new Date();
    const claimed = await Exam.findOneAndUpdate(
      { _id: examId, status: EXAM_STATUS.APPROVED, ...publishLockFree() },
      { $set: { publishLockedAt: lockToken }, $inc: { __v: 1 } },
      { new: true },
    );
    if (!claimed) {
      throw await buildTransitionError(examId, [EXAM_STATUS.APPROVED], 'Chỉ có thể phát hành kỳ thi đã được duyệt');
    }

    let warnings;
    let published;
    let forcedOverActiveAttempts = 0;
    try {
      const impact = await getActiveAttemptImpact(claimed._id);
      if (impact.activeAttemptCount > 0) {
        if (force !== true) {
          const titles = impact.currentExams.map((e) => `"${e.title}"`).join(', ');
          throw new ApiError(
            409,
            `Hiện có ${impact.activeAttemptCount} thí sinh đang làm bài trong kỳ thi ${titles}. ` +
              'Đăng kỳ thi mới sẽ kết thúc kỳ thi đó ngay và các thí sinh này không nộp được bài. Cần xác nhận lần 2 để tiếp tục.',
            'EXAM_PUBLISH_ACTIVE_ATTEMPTS',
          );
        }
        forcedOverActiveAttempts = impact.activeAttemptCount;
      }

      warnings = await assertExamPublishable(claimed);

      // Sinh mã đề và gán thí sinh
      await generateExamCodesAndAssignCandidates(claimed);

      // Lưu trữ kỳ thi đang published trước đó rồi đặt kỳ thi này thành published (nguyên tử, có index chặn trùng)
      published = await finalizePublish(claimed._id, lockToken);
    } catch (err) {
      await Exam.updateOne(
        { _id: claimed._id, publishLockedAt: lockToken },
        { $unset: { publishLockedAt: 1 } },
      ).catch((releaseErr) => console.error('release publish lock failed:', releaseErr));
      throw err;
    }

    try {
      await notificationService.notifyExamPublished(published, leaderId);
    } catch (err) {
      console.error('notifyExamPublished failed:', err);
    }

    const result = published.toObject();
    if (warnings) result.warnings = warnings;
    if (forcedOverActiveAttempts > 0) result.forcedOverActiveAttempts = forcedOverActiveAttempts;
    return result;
  },

  // MỚI — Kiểm tra trước khi đăng: kỳ thi nào đang diễn ra sẽ bị thay thế và đang có bao nhiêu thí sinh làm bài.
  async getPublishImpact(examId) {
    const exam = await Exam.findById(examId).select('_id').lean();
    if (!exam) throw new ApiError(404, 'Không tìm thấy kỳ thi', 'EXAM_NOT_FOUND');
    return getActiveAttemptImpact(exam._id);
  },

  // Lưu trữ (ARCHIVE) một kỳ thi đã duyệt mà Leader quyết định không xuất bản nữa
  async archiveExam(examId, leaderId) {
    // Nguyên tử + không được chen ngang khi đề đang được một Người duyệt đề khác phát hành.
    const exam = await Exam.findOneAndUpdate(
      { _id: examId, status: EXAM_STATUS.APPROVED, ...publishLockFree() },
      { $set: { status: EXAM_STATUS.ARCHIVED, approvedBy: leaderId }, $inc: { __v: 1 } },
      { new: true },
    );
    if (!exam) {
      throw await buildTransitionError(
        examId,
        [EXAM_STATUS.APPROVED],
        'Chỉ có thể bỏ qua kỳ thi đang ở trạng thái chờ phát hành',
      );
    }
    return exam;
  },

  // Lấy kỳ thi đang phát hành chính thức hiện tại
  async getActiveExam() {
    const exam = await Exam.findOne({ status: EXAM_STATUS.PUBLISHED })
      .populate('topicId', 'name')
      .lean();
    return exam;
  },
};
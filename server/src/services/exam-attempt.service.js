/**
 * Service Quản lý Quá trình Thi & Chấm điểm (Exam Attempt Service).
 * Xử lý: Lấy đề thi, Bắt đầu ca thi, Autosave từng câu trả lời, Heartbeat chống gian lận/treo ca thi, Chấm điểm server-side và Cấp thêm lượt thi.
 */

import {
  Employee,
  Exam,
  ExamCandidate,
  ExamCode,
  ExamCodeQuestion,
  Question,
  Answer,
  ExamAttempt,
  AttemptQuestion,
  CandidateAnswer,
  Result,
  ATTEMPT_TYPE,
  ATTEMPT_STATUS,
  EXAM_STATUS,
} from '../models/index.js';
import { ApiError } from '../utils/api-error.js';
import { ROLE_CHOSEN_BY } from '../models/exam-candidate.model.js';
import { getEmployeeRoleOptions, assignCandidateRole } from './exam-code-generation.service.js';

const MAX_OFFICIAL_ATTEMPTS = 1; // Số lượt thi chính thức mặc định
const INACTIVITY_TIMEOUT_MS = 60_000; // Tự động nộp nếu rời ca thi > 1 phút (không heartbeat/thao tác)

// Tính tổng số lượt thi tối đa của thí sinh (bao gồm số lượt được cấp thêm)
function resolveMaxAttempts(examCandidate) {
  return MAX_OFFICIAL_ATTEMPTS + (examCandidate.extraAttemptsGranted ?? 0);
}

// Thuật toán xáo trộn ngẫu nhiên Fisher–Yates
function shuffle(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Sinh Snapshot câu hỏi và thứ tự đáp án xáo ngẫu nhiên dành riêng cho lượt thi cụ thể
async function generateAttemptQuestionSnapshot(attemptId, examCodeId) {
  const examCodeQuestions = await ExamCodeQuestion.find({ examCodeId }).select('questionId');
  const questionIds = examCodeQuestions.map((q) => q.questionId);

  const answers = await Answer.find({ questionId: { $in: questionIds } }).select('_id questionId');
  const answersByQuestion = new Map();
  for (const a of answers) {
    const key = a.questionId.toString();
    if (!answersByQuestion.has(key)) answersByQuestion.set(key, []);
    answersByQuestion.get(key).push(a._id);
  }

  const shuffledQuestionIds = shuffle(questionIds);
  const docs = shuffledQuestionIds.map((qid, index) => ({
    examAttemptId: attemptId,
    questionId: qid,
    orderIndex: index,
    answerOrder: shuffle(answersByQuestion.get(qid.toString()) || []),
  }));

  if (docs.length > 0) {
    await AttemptQuestion.insertMany(docs);
  }
}

// Tái hiện danh sách câu hỏi và các lựa chọn đáp án từ snapshot của lượt thi
async function buildQuestionsFromSnapshot(attemptId) {
  const snapshot = await AttemptQuestion.find({ examAttemptId: attemptId }).sort({ orderIndex: 1 });
  if (snapshot.length === 0) return [];

  const questionIds = snapshot.map((s) => s.questionId);
  const questionDocs = await Question.find({ _id: { $in: questionIds } });
  const questionById = new Map(questionDocs.map((q) => [q._id.toString(), q]));

  const answerIds = snapshot.flatMap((s) => s.answerOrder);
  const answerDocs = await Answer.find({ _id: { $in: answerIds } }).select('_id content');
  const answerById = new Map(answerDocs.map((a) => [a._id.toString(), a]));

  return snapshot
    .filter((s) => questionById.has(s.questionId.toString()))
    .map((s) => {
      const q = questionById.get(s.questionId.toString());
      return {
        id: q._id,
        orderIndex: s.orderIndex,
        content: q.content,
        questionKind: q.questionKind,
        answerType: q.answerType,
        imageUrl: q.imageUrl || null,
        options: s.answerOrder
          .filter((aid) => answerById.has(aid.toString()))
          .map((aid) => {
            const a = answerById.get(aid.toString());
            return { id: a._id, content: a.content };
          }),
      };
    });
}

// Xác định ngữ cảnh thí sinh (hồ sơ nhân viên, kỳ thi đang mở, mã đề đã gán)
async function resolveCandidateContext(userId) {
  const employee = await Employee.findOne({ userId });
  if (!employee) {
    throw new ApiError(404, 'Tài khoản của bạn chưa được liên kết với hồ sơ nhân viên nào', 'EMPLOYEE_NOT_FOUND');
  }

  const exam = await Exam.findOne({ status: EXAM_STATUS.PUBLISHED });
  if (!exam) {
    throw new ApiError(404, 'Hiện không có kỳ thi nào đang diễn ra', 'EXAM_NOT_ACTIVE');
  }

  const examCandidate = await ExamCandidate.findOne({ examId: exam._id, employeeId: employee._id });
  if (!examCandidate) {
    throw new ApiError(403, 'Bạn chưa được gán đề thi cho kỳ thi này. Vui lòng liên hệ Người ra đề / quản trị viên.', 'CANDIDATE_NOT_ASSIGNED');
  }

  return { employee, exam, examCandidate };
}

// Lấy danh sách các lượt thi chính thức của thí sinh
async function getOfficialAttempts(examCandidateId) {
  return ExamAttempt.find({
    examCandidateId,
    attemptType: ATTEMPT_TYPE.OFFICIAL,
  }).sort({ createdAt: -1 });
}

// Tự động chuyển trạng thái ca thi sang EXPIRED nếu đã quá thời gian làm bài
async function expireIfNeeded(attempt) {
  if (
    attempt.status === ATTEMPT_STATUS.IN_PROGRESS &&
    attempt.expiresAt &&
    attempt.expiresAt.getTime() <= Date.now()
  ) {
    attempt.status = ATTEMPT_STATUS.EXPIRED;
    await attempt.save();
  }
  return attempt;
}

// Kiểm tra và tự động nộp bài nếu thí sinh rời khỏi giao diện thi quá thời gian quy định
async function checkAndAutoSubmitIfInactive(attempt, userId) {
  if (attempt.status !== ATTEMPT_STATUS.IN_PROGRESS) return attempt;
  if (!attempt.lastActiveAt) return attempt;

  const idleMs = Date.now() - attempt.lastActiveAt.getTime();
  if (idleMs <= INACTIVITY_TIMEOUT_MS) return attempt;

  await examAttemptService.submitAttempt(userId, attempt._id.toString(), null, 'inactive_timeout');
  return ExamAttempt.findById(attempt._id);
}

// MỚI — Tổng hợp thông tin VAI TRÒ (phòng ban thi) của thí sinh trong kỳ thi để client hiển thị nổi bật.
// - departmentId/name/isMain: phòng ban của mã đề hiện tại (chính là phòng sẽ được dùng để rút câu hỏi riêng)
// - locked: đã khóa (thí sinh đã xác nhận / hệ thống khóa / Người duyệt đề chọn) -> thí sinh không tự đổi được nữa
// - hasDepartmentQuestions: false nếu đề của phòng này chỉ gồm câu chung (phòng không có câu riêng trong ngân hàng thi)
// - options: các vai trò thí sinh có thể chọn (phòng chính + kiêm nhiệm đang hoạt động)
async function buildRoleInfo(employee, examCandidate, examCode) {
  const options = await getEmployeeRoleOptions(employee);
  const currentKey = examCode?.departmentId ? String(examCode.departmentId) : null;
  const current = options.find((o) => String(o.departmentId) === currentKey) ?? options[0] ?? null;

  let hasDepartmentQuestions = true;
  if (current && examCode) {
    const deptQuestionCount = await ExamCodeQuestion.find({ examCodeId: examCode._id })
      .populate({ path: 'questionId', select: 'scope departmentId' })
      .then((rows) =>
        rows.filter(
          (r) => r.questionId?.departmentId && String(r.questionId.departmentId) === String(current.departmentId),
        ).length,
      );
    hasDepartmentQuestions = deptQuestionCount > 0;
  }

  return {
    departmentId: current?.departmentId ?? null,
    name: current?.name ?? null,
    isMain: current?.isMain ?? false,
    locked: Boolean(examCandidate.roleConfirmedAt) || options.length <= 1,
    chosenBy: examCandidate.roleChosenBy ?? (options.length <= 1 ? ROLE_CHOSEN_BY.SYSTEM : null),
    hasDepartmentQuestions,
    options: options.map((o) => ({
      departmentId: o.departmentId,
      name: o.name,
      code: o.code,
      isMain: o.isMain,
    })),
  };
}

export const examAttemptService = {
  // Lấy thông tin đề thi và khôi phục trạng thái làm bài của thí sinh
  async getMyExam(userId) {
    const { employee, exam, examCandidate } = await resolveCandidateContext(userId);
    const maxAttempts = resolveMaxAttempts(examCandidate);

    let attempts = await getOfficialAttempts(examCandidate._id);
    for (const attempt of attempts) {
      await expireIfNeeded(attempt);
    }

    const inProgressBefore = attempts.find((a) => a.status === ATTEMPT_STATUS.IN_PROGRESS);
    let autoSubmitted = null;

    if (inProgressBefore) {
      const afterCheck = await checkAndAutoSubmitIfInactive(inProgressBefore, userId);
      if (afterCheck.status !== ATTEMPT_STATUS.IN_PROGRESS) {
        autoSubmitted = { reason: afterCheck.autoSubmitReason ?? 'inactive_timeout' };
      }
      attempts = await getOfficialAttempts(examCandidate._id);
    }

    const inProgress = attempts.find((a) => a.status === ATTEMPT_STATUS.IN_PROGRESS);
    if (inProgress) {
      inProgress.lastActiveAt = new Date();
      await inProgress.save();
    }

    const examCode = await ExamCode.findById(examCandidate.examCodeId).select('code departmentId');
    const role = await buildRoleInfo(employee, examCandidate, examCode);

    const finishedCount = attempts.filter((a) => a.status !== ATTEMPT_STATUS.IN_PROGRESS).length;
    const canTake = Boolean(inProgress) || finishedCount < maxAttempts;

    let questions = [];
    let savedAnswers = [];
    if (canTake) {
      if (inProgress) {
        questions = await buildQuestionsFromSnapshot(inProgress._id);

        const saved = await CandidateAnswer.find({ examAttemptId: inProgress._id }).select(
          'questionId selectedAnswerIds',
        );
        savedAnswers = saved.map((s) => ({
          questionId: s.questionId,
          selectedAnswerIds: s.selectedAnswerIds,
        }));
      } else {
        const examCodeQuestions = await ExamCodeQuestion.find({ examCodeId: examCandidate.examCodeId })
          .sort({ orderIndex: 1 })
          .populate('questionId');

        const questionIds = examCodeQuestions.map((q) => q.questionId._id);
        const answers = await Answer.find({ questionId: { $in: questionIds } })
          .sort({ sortOrder: 1 })
          .select('_id questionId content');

        const answersByQuestion = new Map();
        for (const a of answers) {
          const key = a.questionId.toString();
          if (!answersByQuestion.has(key)) answersByQuestion.set(key, []);
          answersByQuestion.get(key).push({ id: a._id, content: a.content });
        }

        questions = examCodeQuestions
          .filter((ecq) => ecq.questionId)
          .map((ecq) => ({
            id: ecq.questionId._id,
            orderIndex: ecq.orderIndex,
            content: ecq.questionId.content,
            questionKind: ecq.questionId.questionKind,
            answerType: ecq.questionId.answerType,
            imageUrl: ecq.questionId.imageUrl || null,
            options: answersByQuestion.get(ecq.questionId._id.toString()) || [],
          }));
      }
    }

    return {
      exam: {
        id: exam._id,
        title: exam.title,
        code: examCode?.code ?? null,
        durationMinutes: exam.durationMinutes,
        passThresholdPercent: exam.passThresholdPercent,
        totalQuestions: exam.totalQuestions,
      },
      attempt: inProgress
        ? {
            id: inProgress._id,
            status: inProgress.status,
            startedAt: inProgress.startedAt,
            expiresAt: inProgress.expiresAt,
          }
        : null,
      attemptsUsed: finishedCount,
      maxAttempts,
      canTake,
      role,
      questions,
      savedAnswers,
      autoSubmitted,
    };
  },

  // Bắt đầu một ca thi mới hoặc tiếp tục ca thi đang dở dang (Resume)
  // departmentId (tùy chọn): vai trò thí sinh xác nhận ở popup. Chỉ có tác dụng khi vai trò CHƯA bị khóa; sau khi bắt đầu
  // lượt thi đầu tiên vai trò bị khóa, thí sinh không tự đổi được nữa (Người duyệt đề đổi khi cấp thêm lượt).
  async startAttempt(userId, { departmentId } = {}) {
    const { employee, exam, examCandidate } = await resolveCandidateContext(userId);
    const maxAttempts = resolveMaxAttempts(examCandidate);

    const attempts = await getOfficialAttempts(examCandidate._id);
    for (const attempt of attempts) {
      await expireIfNeeded(attempt);
    }

    const inProgress = attempts.find((a) => a.status === ATTEMPT_STATUS.IN_PROGRESS);
    if (inProgress) {
      inProgress.lastActiveAt = new Date();
      await inProgress.save();
      return {
        attemptId: inProgress._id,
        startedAt: inProgress.startedAt,
        expiresAt: inProgress.expiresAt,
        resumed: true,
      };
    }

    const finishedCount = attempts.filter((a) => a.status !== ATTEMPT_STATUS.IN_PROGRESS).length;
    if (finishedCount >= maxAttempts) {
      throw new ApiError(
        400,
        'Bạn đã sử dụng hết lượt thi chính thức. Nếu cần thi lại, vui lòng liên hệ Người duyệt đề để được cấp phép.',
        'ATTEMPT_LIMIT_REACHED',
      );
    }

    // MỚI — Xác nhận & khóa vai trò (phòng ban) trước khi sinh lượt thi
    const roleOptions = await getEmployeeRoleOptions(employee);
    if (roleOptions.length === 0) {
      throw new ApiError(
        400,
        'Nhân viên không còn phòng ban nào đang hoạt động để thi. Vui lòng liên hệ quản trị viên.',
        'ROLE_INVALID',
      );
    }

    if (!examCandidate.roleConfirmedAt) {
      if (roleOptions.length === 1) {
        // Chỉ có 1 phòng ban: không có gì để chọn -> hệ thống tự khóa theo phòng đó
        await assignCandidateRole({ exam, examCandidate, employee, departmentId: roleOptions[0].departmentId });
        examCandidate.roleChosenBy = ROLE_CHOSEN_BY.SYSTEM;
      } else {
        const currentCode = await ExamCode.findById(examCandidate.examCodeId).select('departmentId');
        const target = departmentId ?? currentCode?.departmentId ?? roleOptions[0].departmentId;
        await assignCandidateRole({ exam, examCandidate, employee, departmentId: target });
        examCandidate.roleChosenBy = ROLE_CHOSEN_BY.CANDIDATE;
      }
      examCandidate.roleConfirmedAt = new Date();
      await examCandidate.save();
    } else if (departmentId) {
      const lockedCode = await ExamCode.findById(examCandidate.examCodeId).select('departmentId');
      if (lockedCode && String(lockedCode.departmentId) !== String(departmentId)) {
        throw new ApiError(
          409,
          'Vai trò thi đã được khóa cho kỳ thi này. Nếu chọn nhầm, vui lòng liên hệ Người duyệt đề để được đổi.',
          'ROLE_LOCKED',
        );
      }
    }

    const finalCode = await ExamCode.findById(examCandidate.examCodeId).select('departmentId');
    const finalRole = roleOptions.find((o) => String(o.departmentId) === String(finalCode?.departmentId));

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + exam.durationMinutes * 60_000);

    const attempt = await ExamAttempt.create({
      examCandidateId: examCandidate._id,
      attemptType: ATTEMPT_TYPE.OFFICIAL,
      departmentId: finalCode?.departmentId,
      startedAt,
      expiresAt,
      status: ATTEMPT_STATUS.IN_PROGRESS,
      lastActiveAt: startedAt,
    });

    await generateAttemptQuestionSnapshot(attempt._id, examCandidate.examCodeId);

    return {
      attemptId: attempt._id,
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      resumed: false,
      roleName: finalRole?.name ?? null,
    };
  },

  // Tự động lưu (Autosave) câu trả lời của thí sinh vào CSDL theo từng câu
  async recordAnswer(userId, attemptId, questionId, selectedAnswerIds) {
    if (!questionId) {
      throw new ApiError(400, 'Thiếu questionId', 'QUESTION_ID_REQUIRED');
    }

    const { examCandidate } = await resolveCandidateContext(userId);

    let attempt = await ExamAttempt.findOne({ _id: attemptId, examCandidateId: examCandidate._id });
    if (!attempt) {
      throw new ApiError(404, 'Không tìm thấy lượt thi', 'ATTEMPT_NOT_FOUND');
    }

    attempt = await expireIfNeeded(attempt);
    attempt = await checkAndAutoSubmitIfInactive(attempt, userId);

    if (attempt.status !== ATTEMPT_STATUS.IN_PROGRESS) {
      throw new ApiError(
        400,
        attempt.autoSubmitReason === 'inactive_timeout'
          ? 'Bạn đã rời khỏi ca thi quá 1 phút, hệ thống đã tự động nộp bài.'
          : 'Lượt thi không còn ở trạng thái đang làm bài',
        'ATTEMPT_INVALID_STATUS',
      );
    }

    await CandidateAnswer.updateOne(
      { examAttemptId: attempt._id, questionId },
      { $set: { selectedAnswerIds: Array.isArray(selectedAnswerIds) ? selectedAnswerIds : [] } },
      { upsert: true },
    );

    attempt.lastActiveAt = new Date();
    await attempt.save();

    return { attemptId: attempt._id, savedAt: attempt.lastActiveAt };
  },

  // Heartbeat định kỳ duy trì trạng thái hoạt động của ca thi
  async heartbeat(userId, attemptId) {
    const { examCandidate } = await resolveCandidateContext(userId);

    let attempt = await ExamAttempt.findOne({ _id: attemptId, examCandidateId: examCandidate._id });
    if (!attempt) {
      throw new ApiError(404, 'Không tìm thấy lượt thi', 'ATTEMPT_NOT_FOUND');
    }

    attempt = await expireIfNeeded(attempt);
    attempt = await checkAndAutoSubmitIfInactive(attempt, userId);

    if (attempt.status === ATTEMPT_STATUS.IN_PROGRESS) {
      attempt.lastActiveAt = new Date();
      await attempt.save();
    }

    return {
      status: attempt.status,
      autoSubmitReason: attempt.autoSubmitReason ?? null,
    };
  },

  // Nộp bài và chấm điểm phía Server (tự động so khớp với đáp án đúng trong CSDL)
  async submitAttempt(userId, attemptId, answersPayload, autoSubmitReason = null) {
    const { exam, examCandidate } = await resolveCandidateContext(userId);

    const attempt = await ExamAttempt.findOne({ _id: attemptId, examCandidateId: examCandidate._id });
    if (!attempt) {
      throw new ApiError(404, 'Không tìm thấy lượt thi', 'ATTEMPT_NOT_FOUND');
    }

    // Nếu đã nộp trước đó thì trả về kết quả đã lưu (Idempotent)
    if (attempt.status === ATTEMPT_STATUS.SUBMITTED) {
      const existing = await Result.findOne({ examAttemptId: attempt._id });
      if (existing) {
        return {
          score: existing.score,
          correctCount: existing.correctCount,
          totalQuestions: existing.totalQuestions,
          passed: existing.passed,
          autoSubmitReason: attempt.autoSubmitReason ?? null,
        };
      }
    }

    if (![ATTEMPT_STATUS.IN_PROGRESS, ATTEMPT_STATUS.EXPIRED].includes(attempt.status)) {
      throw new ApiError(400, 'Lượt thi không ở trạng thái hợp lệ để nộp bài', 'ATTEMPT_INVALID_STATUS');
    }

    const snapshot = await AttemptQuestion.find({ examAttemptId: attempt._id });
    const questionIds = snapshot.map((s) => s.questionId);

    const correctAnswers = await Answer.find({ questionId: { $in: questionIds }, isCorrect: true }).select(
      '_id questionId',
    );
    const correctByQuestion = new Map();
    for (const a of correctAnswers) {
      const key = a.questionId.toString();
      if (!correctByQuestion.has(key)) correctByQuestion.set(key, new Set());
      correctByQuestion.get(key).add(a._id.toString());
    }

    // Lấy đáp án từ payload client gửi lên hoặc fallback từ CandidateAnswer đã autosave
    const answersMap = new Map();
    if (Array.isArray(answersPayload)) {
      for (const item of answersPayload) {
        if (!item?.questionId) continue;
        const selected = Array.isArray(item.selectedAnswerIds) ? item.selectedAnswerIds.map(String) : [];
        answersMap.set(String(item.questionId), selected);
      }
    } else {
      const saved = await CandidateAnswer.find({ examAttemptId: attempt._id }).select(
        'questionId selectedAnswerIds',
      );
      for (const s of saved) {
        answersMap.set(s.questionId.toString(), s.selectedAnswerIds.map(String));
      }
    }

    // So khớp đáp án và tính điểm
    let correctCount = 0;
    const candidateAnswerDocs = [];
    for (const s of snapshot) {
      const qid = s.questionId.toString();
      const selected = answersMap.get(qid) || [];
      const selectedSet = new Set(selected);
      const correctSet = correctByQuestion.get(qid) || new Set();
      const isCorrect =
        selectedSet.size === correctSet.size && [...selectedSet].every((id) => correctSet.has(id));
      if (isCorrect) correctCount += 1;

      candidateAnswerDocs.push({
        examAttemptId: attempt._id,
        questionId: s.questionId,
        selectedAnswerIds: selected,
        isCorrect,
      });
    }

    await CandidateAnswer.deleteMany({ examAttemptId: attempt._id });
    if (candidateAnswerDocs.length > 0) {
      await CandidateAnswer.insertMany(candidateAnswerDocs);
    }

    const totalQuestions = snapshot.length;
    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const passed = score >= (exam.passThresholdPercent ?? 70);

    attempt.status = ATTEMPT_STATUS.SUBMITTED;
    attempt.submittedAt = new Date();
    if (autoSubmitReason) {
      attempt.autoSubmitReason = autoSubmitReason;
    }
    await attempt.save();

    const result = await Result.create({
      examAttemptId: attempt._id,
      score,
      correctCount,
      totalQuestions,
      passed,
    });

    return {
      score: result.score,
      correctCount: result.correctCount,
      totalQuestions: result.totalQuestions,
      passed: result.passed,
      autoSubmitReason: attempt.autoSubmitReason ?? null,
    };
  },

  // Leader cấp quyền thêm lượt thi cho một thí sinh cụ thể
  // departmentId (tùy chọn): đổi vai trò (phòng ban) thi của thí sinh — dành cho trường hợp thí sinh lỡ chọn nhầm
  async grantExtraAttempt(examCandidateId, leaderUserId, { departmentId } = {}) {
    const examCandidate = await ExamCandidate.findById(examCandidateId).populate('employeeId', 'fullname');
    if (!examCandidate) {
      throw new ApiError(404, 'Không tìm thấy thí sinh trong kỳ thi này', 'CANDIDATE_NOT_FOUND');
    }

    const exam = await Exam.findById(examCandidate.examId);
    if (!exam) {
      throw new ApiError(404, 'Không tìm thấy kỳ thi', 'EXAM_NOT_FOUND');
    }
    if (exam.status !== EXAM_STATUS.PUBLISHED) {
      throw new ApiError(
        400,
        'Chỉ có thể cấp lại lượt thi cho kỳ thi đang được đăng chính thức (published)',
        'EXAM_INVALID_STATUS',
      );
    }

    // MỚI — Người duyệt đề đổi vai trò (chỉ khi thí sinh không có lượt thi đang dở)
    let roleChanged = false;
    let roleName = null;
    if (departmentId) {
      const employee = await Employee.findById(examCandidate.employeeId?._id ?? examCandidate.employeeId);
      if (!employee) {
        throw new ApiError(404, 'Không tìm thấy hồ sơ nhân viên của thí sinh', 'EMPLOYEE_NOT_FOUND');
      }
      const inProgress = await ExamAttempt.findOne({
        examCandidateId: examCandidate._id,
        status: ATTEMPT_STATUS.IN_PROGRESS,
      });
      if (inProgress) {
        throw new ApiError(
          400,
          'Thí sinh đang có lượt thi dở dang, không thể đổi vai trò lúc này.',
          'ROLE_CHANGE_BLOCKED',
        );
      }
      const result = await assignCandidateRole({ exam, examCandidate, employee, departmentId });
      roleChanged = result.changed;
      examCandidate.roleChosenBy = ROLE_CHOSEN_BY.LEADER;
      examCandidate.roleConfirmedAt = new Date();
      const options = await getEmployeeRoleOptions(employee);
      roleName = options.find((o) => String(o.departmentId) === String(departmentId))?.name ?? null;
    }

    examCandidate.extraAttemptsGranted = (examCandidate.extraAttemptsGranted ?? 0) + 1;
    await examCandidate.save();

    return {
      examCandidateId: examCandidate._id,
      employeeName: examCandidate.employeeId?.fullname ?? null,
      examId: exam._id,
      examTitle: exam.title,
      extraAttemptsGranted: examCandidate.extraAttemptsGranted,
      maxAttempts: resolveMaxAttempts(examCandidate),
      roleChanged,
      roleName,
      grantedBy: leaderUserId,
    };
  },
};
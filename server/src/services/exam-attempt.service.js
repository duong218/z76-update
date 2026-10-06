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
import {
  getEmployeeRoleOptions,
  assignCandidateRole,
  isCommonCompensationEnabled,
} from './exam-code-generation.service.js';

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
    const roleOptions = await getEmployeeRoleOptions(employee, exam);
    const hasEligible = roleOptions.some((o) => o.eligible);
    if (!hasEligible) {
      throw new ApiError(
        403,
        'Kỳ thi này không dành cho phòng ban của bạn.',
        'CANDIDATE_OUT_OF_SCOPE',
      );
    }
    throw new ApiError(
      403,
      'Bạn chưa được gán đề thi cho kỳ thi này. Vui lòng liên hệ Người ra đề / quản trị viên.',
      'CANDIDATE_NOT_ASSIGNED',
    );
  }

  return { employee, exam, examCandidate };
}

// MỚI — Xác định ngữ cảnh THEO CHÍNH LƯỢT THI (autosave / heartbeat / nộp bài), không phụ thuộc kỳ thi đang published.
// Trước đây các thao tác này tìm "kỳ thi đang published" nên khi Người duyệt đề đăng kỳ thi mới (kỳ thi cũ bị lưu trữ),
// thí sinh đang làm dở bị báo ATTEMPT_NOT_FOUND và không nộp được bài. Quyền sở hữu vẫn được kiểm tra: lượt thi phải
// thuộc ExamCandidate của chính nhân viên đang đăng nhập.
async function resolveAttemptContext(userId, attemptId) {
  const employee = await Employee.findOne({ userId });
  if (!employee) {
    throw new ApiError(404, 'Tài khoản của bạn chưa được liên kết với hồ sơ nhân viên nào', 'EMPLOYEE_NOT_FOUND');
  }

  const attempt = await ExamAttempt.findById(attemptId);
  const examCandidate = attempt
    ? await ExamCandidate.findOne({ _id: attempt.examCandidateId, employeeId: employee._id })
    : null;
  if (!attempt || !examCandidate) {
    throw new ApiError(404, 'Không tìm thấy lượt thi', 'ATTEMPT_NOT_FOUND');
  }

  const exam = await Exam.findById(examCandidate.examId);
  if (!exam) {
    throw new ApiError(404, 'Không tìm thấy kỳ thi của lượt thi này', 'EXAM_NOT_FOUND');
  }

  return { employee, exam, examCandidate, attempt };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Chờ luồng khác (thí sinh bấm nộp / hệ thống tự nộp) ghi xong Result của lượt thi.
async function waitForResult(attemptId, tries = 10, delayMs = 150) {
  for (let i = 0; i < tries; i += 1) {
    const result = await Result.findOne({ examAttemptId: attemptId });
    if (result) return result;
    await sleep(delayMs);
  }
  return null;
}

function toResultPayload(result, autoSubmitReason) {
  return {
    score: result.score,
    correctCount: result.correctCount,
    totalQuestions: result.totalQuestions,
    passed: result.passed,
    autoSubmitReason: autoSubmitReason ?? null,
  };
}

// Chấm điểm và nộp một lượt thi (dùng chung cho thí sinh tự nộp, tự nộp do rời ca thi và tự nộp khi kỳ thi bị thay thế).
// Chiếm lượt thi bằng 1 lệnh nguyên tử (IN_PROGRESS/EXPIRED -> SUBMITTED): nếu nhiều luồng cùng nộp (vd thí sinh bấm nộp
// đúng lúc Người duyệt đề đăng kỳ thi mới) thì chỉ 1 luồng chấm và tạo Result, các luồng còn lại trả lại kết quả đã lưu.
async function gradeAndSubmitAttempt({ attempt, exam, answersPayload = null, autoSubmitReason = null }) {
  // Nếu đã nộp trước đó thì trả về kết quả đã lưu (Idempotent)
  if (attempt.status === ATTEMPT_STATUS.SUBMITTED) {
    const existing = await Result.findOne({ examAttemptId: attempt._id });
    if (existing) return toResultPayload(existing, attempt.autoSubmitReason);
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

  const totalQuestions = snapshot.length;
  const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const passed = score >= (exam.passThresholdPercent ?? 70);

  // Chiếm lượt thi (nguyên tử). Không chiếm được = luồng khác vừa nộp -> trả về kết quả của luồng đó.
  const previousStatus = attempt.status;
  const claimed = await ExamAttempt.findOneAndUpdate(
    { _id: attempt._id, status: { $in: [ATTEMPT_STATUS.IN_PROGRESS, ATTEMPT_STATUS.EXPIRED] } },
    {
      $set: {
        status: ATTEMPT_STATUS.SUBMITTED,
        submittedAt: new Date(),
        ...(autoSubmitReason ? { autoSubmitReason } : {}),
      },
    },
    { new: true },
  );
  if (!claimed) {
    const existing = await waitForResult(attempt._id);
    if (existing) {
      const latest = await ExamAttempt.findById(attempt._id).select('autoSubmitReason');
      return toResultPayload(existing, latest?.autoSubmitReason);
    }
    throw new ApiError(400, 'Lượt thi không ở trạng thái hợp lệ để nộp bài', 'ATTEMPT_INVALID_STATUS');
  }

  try {
    await CandidateAnswer.deleteMany({ examAttemptId: attempt._id });
    if (candidateAnswerDocs.length > 0) {
      await CandidateAnswer.insertMany(candidateAnswerDocs);
    }

    const result = await Result.create({
      examAttemptId: attempt._id,
      score,
      correctCount,
      totalQuestions,
      passed,
    });
    return toResultPayload(result, claimed.autoSubmitReason);
  } catch (err) {
    // Ghi kết quả lỗi: trả lượt thi về trạng thái cũ để có thể nộp lại, không để lượt "đã nộp" mà thiếu Result.
    await ExamAttempt.updateOne(
      { _id: attempt._id, status: ATTEMPT_STATUS.SUBMITTED },
      {
        $set: { status: previousStatus },
        $unset: { submittedAt: 1, ...(autoSubmitReason ? { autoSubmitReason: 1 } : {}) },
      },
    ).catch((revertErr) => console.error('revert attempt claim failed:', revertErr));
    throw err;
  }
}

// MỚI — Kỳ thi của lượt thi đã không còn published (bị thay thế khi Người duyệt đề đăng kỳ thi mới) mà lượt thi vẫn đang
// làm dở -> nộp và chấm ngay với các đáp án đã tự lưu, đánh dấu autoSubmitReason = 'exam_replaced'.
async function finalizeIfExamReplaced(attempt, exam) {
  if (exam.status === EXAM_STATUS.PUBLISHED) return attempt;
  if (attempt.status !== ATTEMPT_STATUS.IN_PROGRESS) return attempt;
  // Kỳ thi đã QUÁ HẠN (endDate) thì không phải bị "thay thế": thí sinh vẫn được làm hết giờ làm bài của mình, không cắt ngang.
  if (exam.endDate && new Date(exam.endDate).getTime() <= Date.now()) return attempt;
  await gradeAndSubmitAttempt({ attempt, exam, autoSubmitReason: 'exam_replaced' });
  return ExamAttempt.findById(attempt._id);
}

const EXAM_REPLACED_MESSAGE =
  'Người duyệt đề vừa đăng một kỳ thi mới nên kỳ thi này đã kết thúc. Hệ thống đã tự động nộp bài với các đáp án bạn đã chọn.';

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
// - locked: đã khóa (thí sinh đã xác nhận / hệ thống khóa / Người duyệt đề chọn) hoặc chỉ có 1 vai trò duy nhất (không có gì để chọn).
//   Còn >= 2 vai trò mà chưa khóa thì client hiện danh sách, vai trò chưa đủ điều kiện (eligible = false) bị làm mờ, không chọn được.
// - hasDepartmentQuestions: false nếu đề của phòng này chỉ gồm câu chung (phòng không có câu riêng trong ngân hàng thi)
// - allowCommonCompensation: kỳ thi có bật bù câu chung không (tắt -> phòng thiếu câu riêng bị khóa không cho chọn)
// - hasEligibleRole: còn ít nhất 1 vai trò đủ điều kiện để thi
// - options: các vai trò (phòng chính + kiêm nhiệm đang hoạt động), kèm eligible / deptQuestionCount / requiredDeptQuestions
async function buildRoleInfo(employee, exam, examCandidate, examCode) {
  const options = await getEmployeeRoleOptions(employee, exam);
  const eligibleOptions = options.filter((o) => o.eligible);
  const currentKey = examCode?.departmentId ? String(examCode.departmentId) : null;
  const current =
    options.find((o) => String(o.departmentId) === currentKey) ?? eligibleOptions[0] ?? options[0] ?? null;

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
    allowCommonCompensation: isCommonCompensationEnabled(exam),
    hasEligibleRole: eligibleOptions.length > 0,
    options: options.map((o) => ({
      departmentId: o.departmentId,
      name: o.name,
      code: o.code,
      isMain: o.isMain,
      eligible: o.eligible,
      inScope: o.inScope,
      reason: o.reason ?? null,
      deptQuestionCount: o.deptQuestionCount ?? 0,
      requiredDeptQuestions: o.requiredDeptQuestions ?? 0,
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
    const role = await buildRoleInfo(employee, exam, examCandidate, examCode);

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

    // MỚI — Chỉ cho BẮT ĐẦU lượt thi mới trong khung giờ kỳ thi (startDate..endDate). Lượt đang dở (resume ở trên) vẫn được làm tiếp
    // và nộp sau endDate; lượt bắt đầu sát giờ kết thúc vẫn được làm đủ thời gian làm bài (expiresAt = lúc bắt đầu + thời lượng).
    const nowMs = Date.now();
    const fmtVN = (d) => new Date(d).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    if (exam.startDate && nowMs < new Date(exam.startDate).getTime()) {
      throw new ApiError(
        403,
        `Kỳ thi "${exam.title}" chưa bắt đầu. Thời gian bắt đầu: ${fmtVN(exam.startDate)}.`,
        'EXAM_NOT_STARTED',
      );
    }
    if (exam.endDate && nowMs > new Date(exam.endDate).getTime()) {
      throw new ApiError(
        403,
        `Kỳ thi "${exam.title}" đã kết thúc lúc ${fmtVN(exam.endDate)}, không thể bắt đầu lượt thi mới.`,
        'EXAM_ENDED',
      );
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
    // Chỉ các vai trò ĐỦ ĐIỀU KIỆN (đủ câu riêng, hoặc kỳ thi bật bù) mới được chọn
    const roleOptions = await getEmployeeRoleOptions(employee, exam);
    if (roleOptions.length === 0) {
      throw new ApiError(
        400,
        'Nhân viên không còn phòng ban nào đang hoạt động để thi. Vui lòng liên hệ quản trị viên.',
        'ROLE_INVALID',
      );
    }
    const eligibleOptions = roleOptions.filter((o) => o.eligible);
    if (eligibleOptions.length === 0) {
      throw new ApiError(
        400,
        'Kỳ thi này không dành cho phòng ban nào của bạn. Vui lòng liên hệ Người duyệt đề / quản trị viên nếu bạn cho rằng đây là nhầm lẫn.',
        'ROLE_NOT_ELIGIBLE',
      );
    }

    if (!examCandidate.roleConfirmedAt) {
      if (eligibleOptions.length === 1) {
        // Chỉ có 1 vai trò đủ điều kiện: không có gì để chọn -> hệ thống tự khóa theo phòng đó
        await assignCandidateRole({ exam, examCandidate, employee, departmentId: eligibleOptions[0].departmentId });
        examCandidate.roleChosenBy = ROLE_CHOSEN_BY.SYSTEM;
      } else {
        const currentCode = await ExamCode.findById(examCandidate.examCodeId).select('departmentId');
        const target = departmentId ?? currentCode?.departmentId ?? eligibleOptions[0].departmentId;
        // assignCandidateRole ném ROLE_INVALID (phòng ngoài tập vai trò) hoặc ROLE_NOT_ELIGIBLE (phòng chưa đủ câu riêng)
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

    const { exam, attempt: found } = await resolveAttemptContext(userId, attemptId);

    let attempt = await expireIfNeeded(found);
    attempt = await finalizeIfExamReplaced(attempt, exam);
    attempt = await checkAndAutoSubmitIfInactive(attempt, userId);

    if (attempt.status !== ATTEMPT_STATUS.IN_PROGRESS) {
      if (attempt.autoSubmitReason === 'exam_replaced') {
        throw new ApiError(409, EXAM_REPLACED_MESSAGE, 'EXAM_REPLACED');
      }
      if (attempt.autoSubmitReason === 'exam_ended') {
        throw new ApiError(
          409,
          'Kỳ thi đã kết thúc. Hệ thống đã tự động nộp bài với các đáp án bạn đã chọn.',
          'EXAM_CLOSED',
        );
      }
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
    const { exam, attempt: found } = await resolveAttemptContext(userId, attemptId);

    let attempt = await expireIfNeeded(found);
    attempt = await finalizeIfExamReplaced(attempt, exam);
    attempt = await checkAndAutoSubmitIfInactive(attempt, userId);

    if (attempt.status === ATTEMPT_STATUS.IN_PROGRESS) {
      attempt.lastActiveAt = new Date();
      await attempt.save();
    }

    const response = {
      status: attempt.status,
      autoSubmitReason: attempt.autoSubmitReason ?? null,
    };
    // Kỳ thi bị thay thế: trả kèm điểm đã chấm để thí sinh thấy ngay kết quả của mình trong thông báo.
    if (['exam_replaced', 'exam_ended'].includes(attempt.autoSubmitReason)) {
      const saved = await Result.findOne({ examAttemptId: attempt._id });
      if (saved) {
        response.result = {
          score: saved.score,
          correctCount: saved.correctCount,
          totalQuestions: saved.totalQuestions,
          passed: saved.passed,
        };
      }
    }
    return response;
  },

  // Nộp bài và chấm điểm phía Server (tự động so khớp với đáp án đúng trong CSDL)
  async submitAttempt(userId, attemptId, answersPayload, autoSubmitReason = null) {
    const { exam, attempt } = await resolveAttemptContext(userId, attemptId);
    return gradeAndSubmitAttempt({ attempt, exam, answersPayload, autoSubmitReason });
  },

  // MỚI — Người duyệt đề xem các vai trò (phòng ban) của 1 thí sinh để chọn khi cấp thêm lượt thi.
  // Trả về vai trò hiện tại, các option (kèm eligible / số câu riêng) và có đang có lượt thi dở dang không.
  async getCandidateRoleOptions(examCandidateId) {
    const examCandidate = await ExamCandidate.findById(examCandidateId);
    if (!examCandidate) {
      throw new ApiError(404, 'Không tìm thấy thí sinh trong kỳ thi này', 'CANDIDATE_NOT_FOUND');
    }
    const exam = await Exam.findById(examCandidate.examId);
    if (!exam) {
      throw new ApiError(404, 'Không tìm thấy kỳ thi', 'EXAM_NOT_FOUND');
    }
    const employee = await Employee.findById(examCandidate.employeeId);
    if (!employee) {
      throw new ApiError(404, 'Không tìm thấy hồ sơ nhân viên của thí sinh', 'EMPLOYEE_NOT_FOUND');
    }

    const examCode = await ExamCode.findById(examCandidate.examCodeId).select('departmentId');
    const options = await getEmployeeRoleOptions(employee, exam);
    const hasInProgress = Boolean(
      await ExamAttempt.exists({ examCandidateId: examCandidate._id, status: ATTEMPT_STATUS.IN_PROGRESS }),
    );

    return {
      examCandidateId: examCandidate._id,
      currentDepartmentId: examCode?.departmentId ?? null,
      allowCommonCompensation: isCommonCompensationEnabled(exam),
      hasInProgress,
      options: options.map((o) => ({
        departmentId: o.departmentId,
        name: o.name,
        code: o.code,
        isMain: o.isMain,
        eligible: o.eligible,
        deptQuestionCount: o.deptQuestionCount ?? 0,
        requiredDeptQuestions: o.requiredDeptQuestions ?? 0,
      })),
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
      const options = await getEmployeeRoleOptions(employee, exam);
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

// MỚI — Nộp và chấm mọi lượt thi chính thức đang làm dở của các kỳ thi `examIds`, bằng các đáp án đã tự lưu, đánh dấu
// `autoSubmitReason`. Một lượt lỗi không làm hỏng cả đợt (chỉ ghi log và đếm vào `failed`).
async function finalizeInProgressAttempts(examIds, autoSubmitReason) {
  if (!examIds?.length) return { finalized: 0, failed: 0 };

  const exams = await Exam.find({ _id: { $in: examIds } });
  const examById = new Map(exams.map((e) => [e._id.toString(), e]));
  const candidates = await ExamCandidate.find({ examId: { $in: examIds } }).select('_id examId').lean();
  if (candidates.length === 0) return { finalized: 0, failed: 0 };

  const examIdByCandidate = new Map(candidates.map((c) => [c._id.toString(), c.examId.toString()]));
  const attempts = await ExamAttempt.find({
    examCandidateId: { $in: candidates.map((c) => c._id) },
    attemptType: ATTEMPT_TYPE.OFFICIAL,
    status: ATTEMPT_STATUS.IN_PROGRESS,
  });

  let finalized = 0;
  let failed = 0;
  const BATCH = 10;
  for (let i = 0; i < attempts.length; i += BATCH) {
    const batch = attempts.slice(i, i + BATCH);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      batch.map(async (attempt) => {
        const exam = examById.get(examIdByCandidate.get(attempt.examCandidateId.toString()));
        if (!exam) return;
        try {
          await gradeAndSubmitAttempt({ attempt, exam, autoSubmitReason });
          finalized += 1;
        } catch (err) {
          failed += 1;
          console.error(`finalize attempt (${autoSubmitReason}) failed:`, attempt._id.toString(), err);
        }
      }),
    );
  }
  return { finalized, failed };
}

// Gọi khi Người duyệt đề đăng kỳ thi mới (xem publishExam trong exam.service.js), TRƯỚC khi lưu trữ kỳ thi cũ: để kết quả
// được lưu kể cả khi thí sinh đã đóng trình duyệt. Lượt nào sót sẽ được nộp tiếp ở lần heartbeat / autosave kế tiếp.
export function finalizeAttemptsForReplacedExams(examIds) {
  return finalizeInProgressAttempts(examIds, 'exam_replaced');
}

// MỚI — Gọi khi kỳ thi hết hạn (quá endDate) và sắp được tự động lưu trữ (xem archiveExpiredExams trong exam.service.js):
// nộp và chấm các lượt thi còn dở dang đã quá giờ làm bài / bị bỏ dở.
export function finalizeAttemptsForEndedExams(examIds) {
  return finalizeInProgressAttempts(examIds, 'exam_ended');
}
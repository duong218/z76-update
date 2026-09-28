/**
 * Service Luyện tập theo chủ đề (Practice).
 * Câu hỏi lấy từ ngân hàng chung (Common) và câu riêng của đúng phòng ban thí sinh.
 * Kết quả luyện tập lưu riêng ở PracticeSession, không ảnh hưởng thống kê thi chính thức.
 */

import mongoose from 'mongoose';
import { Answer, Employee, Question, Topic } from '../models/index.js';
import { PracticeSession } from '../models/practice-session.model.js';
import { QUESTION_SCOPE } from '../models/constants.js';
import { ApiError } from '../utils/api-error.js';

const MAX_QUESTIONS = 30;
const DIFFICULTY_VALUES = new Set(['all', 'easy', 'medium', 'hard']);

// Bộ lọc câu hỏi hợp lệ cho thí sinh: đúng chủ đề, đang hoạt động,
// và (câu chung HOẶC câu riêng của đúng phòng ban thí sinh)
async function buildEligibleFilter(userId, topicIds, difficulty = 'all') {
  const employee = await Employee.findOne({ userId }).select('departmentId').lean();
  if (!employee?.departmentId) {
    throw new ApiError(400, 'Tài khoản chưa gắn phòng ban', 'PRACTICE_NO_DEPARTMENT');
  }

  const filter = {
    isActive: true,
    topicId: { $in: topicIds.map((id) => new mongoose.Types.ObjectId(id)) },
    $or: [
      { scope: QUESTION_SCOPE.COMMON },
      { scope: QUESTION_SCOPE.DEPARTMENT_SPECIFIC, departmentId: employee.departmentId },
    ],
  };

  if (difficulty && difficulty !== 'all') {
    filter.difficulty = difficulty;
  }
  return filter;
}

// Chuẩn hoá tham số đầu vào do client gửi lên
function normalizeStartOptions(options = {}) {
  const topicIds = Array.isArray(options.topicIds) ? options.topicIds.filter(Boolean) : [];
  if (topicIds.length === 0) {
    throw new ApiError(400, 'Vui lòng chọn ít nhất một chủ đề', 'PRACTICE_TOPIC_REQUIRED');
  }

  const questionCount = Math.min(
    Math.max(parseInt(options.questionCount, 10) || 10, 1),
    MAX_QUESTIONS,
  );
  const timeLimitMin = Math.max(parseInt(options.timeLimitMin, 10) || 0, 0);
  const difficulty = DIFFICULTY_VALUES.has(options.difficulty) ? options.difficulty : 'all';

  return { topicIds, questionCount, timeLimitMin, difficulty };
}

// Danh sách chủ đề có ít nhất 1 câu phù hợp với thí sinh
export async function getAvailableTopics(userId) {
  const topics = await Topic.find({ isActive: true }).select('name').lean();

  const result = [];
  for (const topic of topics) {
    const filter = await buildEligibleFilter(userId, [topic._id.toString()]);
    const availableCount = await Question.countDocuments(filter);
    if (availableCount > 0) {
      result.push({ id: topic._id, name: topic.name, availableCount });
    }
  }
  return result;
}

// Bắt đầu bài luyện: rút ngẫu nhiên câu hỏi, trả về câu hỏi KHÔNG kèm isCorrect
export async function startPractice(userId, rawOptions) {
  const { topicIds, questionCount, timeLimitMin, difficulty } = normalizeStartOptions(rawOptions);
  const filter = await buildEligibleFilter(userId, topicIds, difficulty);

  const availableCount = await Question.countDocuments(filter);
  if (availableCount === 0) {
    throw new ApiError(400, 'Chưa có câu hỏi phù hợp cho lựa chọn này', 'PRACTICE_NO_QUESTIONS');
  }

  const size = Math.min(questionCount, availableCount);
  const questions = await Question.aggregate([{ $match: filter }, { $sample: { size } }]);
  const questionIds = questions.map((q) => q._id);

  const answers = await Answer.find({ questionId: { $in: questionIds } })
    .sort({ sortOrder: 1 })
    .lean();

  const session = await PracticeSession.create({
    userId,
    topicIds,
    difficulty,
    questions: questionIds.map((id) => ({ questionId: id })),
    totalQuestions: questionIds.length,
    timeLimitSec: timeLimitMin * 60,
  });

  return {
    sessionId: session._id,
    availableCount,
    timeLimitSec: session.timeLimitSec,
    questions: questions.map((q) => ({
      id: q._id,
      content: q.content,
      answerType: q.answerType,
      imageUrl: q.imageUrl || null,
      answers: answers
        .filter((a) => a.questionId.equals(q._id))
        .map((a) => ({ id: a._id, content: a.content })),
    })),
  };
}

// Nộp bài: gán đáp án client gửi lên, so khớp đúng và đủ tập đáp án đúng, tính điểm
export async function submitPractice(userId, sessionId, answers = []) {
  const session = await PracticeSession.findOne({ _id: sessionId, userId });
  if (!session) {
    throw new ApiError(404, 'Không tìm thấy lượt luyện', 'PRACTICE_NOT_FOUND');
  }
  if (session.status !== 'in_progress') {
    throw new ApiError(400, 'Lượt luyện đã kết thúc', 'PRACTICE_ALREADY_SUBMITTED');
  }

  const answerByQuestion = new Map(
    (Array.isArray(answers) ? answers : []).map((a) => [
      String(a.questionId),
      Array.isArray(a.selectedAnswerIds) ? a.selectedAnswerIds.map(String) : [],
    ]),
  );
  for (const item of session.questions) {
    item.selectedAnswerIds = answerByQuestion.get(String(item.questionId)) ?? [];
  }

  const questionIds = session.questions.map((q) => q.questionId);
  const correctAnswers = await Answer.find({
    questionId: { $in: questionIds },
    isCorrect: true,
  }).lean();

  const correctSetByQuestion = new Map();
  for (const a of correctAnswers) {
    const key = a.questionId.toString();
    if (!correctSetByQuestion.has(key)) correctSetByQuestion.set(key, new Set());
    correctSetByQuestion.get(key).add(a._id.toString());
  }

  let correctCount = 0;
  for (const item of session.questions) {
    const correct = correctSetByQuestion.get(item.questionId.toString()) ?? new Set();
    const selected = new Set(item.selectedAnswerIds.map(String));
    item.isCorrect =
      selected.size === correct.size && [...selected].every((id) => correct.has(id));
    if (item.isCorrect) correctCount += 1;
  }

  session.correctCount = correctCount;
  session.status = 'submitted';
  session.submittedAt = new Date();
  await session.save();

  return {
    sessionId: session._id,
    totalQuestions: session.totalQuestions,
    correctCount,
    percent: session.totalQuestions > 0
      ? Math.round((correctCount / session.totalQuestions) * 100)
      : 0,
  };
}

// Tổng hợp tiến độ: tổng quan, theo chủ đề (yếu nhất trước), lịch sử gần nhất
export async function getPracticeProgress(userId) {
  const sessions = await PracticeSession.find({ userId, status: 'submitted' })
    .sort({ submittedAt: -1 })
    .populate('topicIds', 'name')
    .lean();

  const totalQuestions = sessions.reduce((sum, s) => sum + s.totalQuestions, 0);
  const totalCorrect = sessions.reduce((sum, s) => sum + s.correctCount, 0);

  const byTopic = new Map();
  for (const s of sessions) {
    for (const t of s.topicIds) {
      if (!t) continue;
      const key = t._id.toString();
      if (!byTopic.has(key)) {
        byTopic.set(key, { topicId: key, name: t.name, questions: 0, correct: 0, sessions: 0 });
      }
      const entry = byTopic.get(key);
      entry.questions += s.totalQuestions;
      entry.correct += s.correctCount;
      entry.sessions += 1;
    }
  }

  const topics = [...byTopic.values()]
    .map((e) => ({
      ...e,
      percent: e.questions > 0 ? Math.round((e.correct / e.questions) * 100) : 0,
    }))
    .sort((a, b) => a.percent - b.percent);

  return {
    totalSessions: sessions.length,
    totalQuestions,
    averagePercent: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
    topics,
    recent: sessions.slice(0, 10).map((s) => ({
      id: s._id,
      topics: s.topicIds.filter(Boolean).map((t) => t.name),
      totalQuestions: s.totalQuestions,
      correctCount: s.correctCount,
      percent: s.totalQuestions > 0 ? Math.round((s.correctCount / s.totalQuestions) * 100) : 0,
      submittedAt: s.submittedAt,
    })),
  };
}
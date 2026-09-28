import { apiRequest } from './api.js';
import { getAuthHeaders } from './auth.service.js';

/** Danh sách chủ đề có câu hỏi phù hợp với thí sinh */
export async function fetchPracticeTopics() {
  const result = await apiRequest('/practice/topics', {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return result.data;
}

/** Tiến độ luyện tập: tổng quan, theo chủ đề, lịch sử gần nhất */
export async function fetchPracticeProgress() {
  const result = await apiRequest('/practice/progress', {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return result.data;
}

/**
 * Bắt đầu bài luyện.
 * options: { topicIds: string[], questionCount: number, timeLimitMin: number,
 *            difficulty: 'all'|'easy'|'medium'|'hard', mode: 'instant'|'exam' }
 */
export async function startPractice(options) {
  const result = await apiRequest('/practice/start', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(options),
  });
  return result.data;
}

/**
 * Chế độ 'instant': chấm 1 câu ngay, trả về { isCorrect, correctAnswerIds, selectedAnswerIds }.
 */
export async function checkPracticeAnswer(sessionId, questionId, selectedAnswerIds) {
  const result = await apiRequest(`/practice/${sessionId}/check`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ questionId, selectedAnswerIds }),
  });
  return result.data;
}

/**
 * Nộp bài luyện.
 * answers: [{ questionId: string, selectedAnswerIds: string[] }]
 */
export async function submitPractice(sessionId, answers) {
  const result = await apiRequest(`/practice/${sessionId}/submit`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ answers }),
  });
  return result.data;
}
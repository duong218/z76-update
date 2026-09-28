import { apiRequest } from './api.js';
import { getAuthHeaders } from './auth.service.js';

/**
 * Lấy đề thi hiện tại của thí sinh (câu hỏi + đáp án, đáp án đúng đã bị ẩn ở
 * backend) cùng trạng thái lượt thi (đang dở / đã dùng hết), kèm
 * `savedAnswers` (đáp án đã autosave — dùng để khôi phục khi đổi thiết bị)
 * và `autoSubmitted` (khác null nếu backend vừa phát hiện + tự nộp bài do
 * rời khỏi ca thi quá 1 phút ngay trong lần gọi này).
 */
export async function fetchMyExam() {
  const result = await apiRequest('/exam-attempts/my-exam', {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return result.data;
}

/**
 * Bắt đầu lượt thi chính thức. Nếu đang có lượt dở (in_progress) thì backend
 * tự trả về đúng lượt đó (resume) thay vì tạo lượt mới.
 */
export async function startExamAttempt() {
  const result = await apiRequest('/exam-attempts/start', {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return result.data;
}

/**
 * Nộp bài thi. answers: [{ questionId, selectedAnswerIds: string[] }]
 */
export async function submitExamAttempt(attemptId, answers) {
  const result = await apiRequest(`/exam-attempts/${attemptId}/submit`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ answers }),
  });
  return result.data;
}

/**
 * Autosave 1 câu trả lời — gọi mỗi khi thí sinh chọn/đổi đáp án. KHÔNG chấm
 * điểm ở đây (chỉ upsert selectedAnswerIds), điểm thật vẫn do submitExamAttempt
 * quyết định lúc nộp bài. Nếu lượt thi vừa bị hệ thống tự nộp do rời khỏi ca
 * thi quá 1 phút, backend trả lỗi ATTEMPT_INVALID_STATUS — gọi nơi dùng hàm
 * này (ExamModal) tự bắt lỗi này qua `err.code` để hiện đúng thông báo.
 */
export async function answerExamQuestion(attemptId, questionId, selectedAnswerIds) {
  const result = await apiRequest(`/exam-attempts/${attemptId}/answer`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ questionId, selectedAnswerIds }),
  });
  return result.data;
}

/**
 * Heartbeat giữ phiên thi "còn sống". Gọi định kỳ (vd mỗi 15s) khi tab đang
 * hiển thị. Nếu backend phát hiện đã rời khỏi ca thi quá 1 phút, lượt thi sẽ
 * bị TỰ ĐỘNG NỘP ngay trong lần gọi này — response trả về
 * `data.autoSubmitReason` khác null để client hiện đúng thông báo và dừng
 * làm bài.
 */
export async function sendExamHeartbeat(attemptId) {
  const result = await apiRequest(`/exam-attempts/${attemptId}/heartbeat`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return result.data;
}
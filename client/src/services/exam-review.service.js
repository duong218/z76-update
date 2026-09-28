import { apiRequest } from './api';
import { getAuthHeaders } from './auth.service';

export async function fetchPendingExams() {
  const res = await apiRequest('/exams?status=pending_review', {
    headers: getAuthHeaders(),
  });
  return res.data;
}

export async function fetchApprovedExams() {
  const res = await apiRequest('/exams?status=approved', {
    headers: getAuthHeaders(),
  });
  return res.data;
}

// Lấy danh sách kỳ thi theo 1 trạng thái bất kỳ — dùng chung cho các nhu cầu lọc khác
// ngoài "chờ duyệt" / "chờ phát hành" phía trên.
export async function fetchExamsByStatus(status) {
  const res = await apiRequest(`/exams?status=${encodeURIComponent(status)}`, {
    headers: getAuthHeaders(),
  });
  return res.data;
}

// Lịch sử các đề xuất đã được Người duyệt đề xử lý xong: bị từ chối, đã đăng chính thức,
// hoặc đã bị lưu trữ (khi có kỳ thi khác được đăng đè lên, hoặc bị "bỏ qua"). Gộp cả 3
// trạng thái này lại thành 1 danh sách "Lịch sử duyệt kỳ thi", sắp xếp theo thời gian xử
// lý gần nhất. Route GET /api/exams hiện chỉ lọc theo đúng 1 status/lần gọi, nên gọi song
// song rồi merge ở phía client thay vì sửa API.
export async function fetchExamHistory() {
  const [rejected, published, archived] = await Promise.all([
    fetchExamsByStatus('rejected').catch(() => []),
    fetchExamsByStatus('published').catch(() => []),
    fetchExamsByStatus('archived').catch(() => []),
  ]);

  const all = [
    ...(Array.isArray(rejected) ? rejected : []),
    ...(Array.isArray(published) ? published : []),
    ...(Array.isArray(archived) ? archived : []),
  ];

  const getProcessedAt = (exam) =>
    new Date(exam.publishedAt || exam.approvedAt || exam.updatedAt || exam.createdAt || 0).getTime();

  return all.sort((a, b) => getProcessedAt(b) - getProcessedAt(a));
}

export async function approveExam(id, payload) {
  const res = await apiRequest(`/exams/${id}/approve`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function rejectExam(id, reason) {
  const res = await apiRequest(`/exams/${id}/reject`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ rejectionReason: reason }),
  });
  return res.data;
}

export async function publishExam(id) {
  const res = await apiRequest(`/exams/${id}/publish`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return res.data;
}

// "Bỏ qua" một kỳ thi đã duyệt (approved) đang chờ phát hành — lưu trữ nó
// mà không đăng chính thức.
export async function archiveExam(id) {
  const res = await apiRequest(`/exams/${id}/archive`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return res.data;
}

// MỚI — Cấp thêm 1 lượt thi chính thức cho 1 thí sinh cụ thể trong 1 kỳ thi
// cụ thể. `examCandidateId` lấy từ field cùng tên trong kết quả
// fetchDetailedResults() (report.service.js) — KHÔNG dùng employeeId hay
// examId riêng lẻ vì 1 employee có thể có nhiều ExamCandidate ở các kỳ thi
// khác nhau.
export async function grantExtraAttempt(examCandidateId) {
  const res = await apiRequest(`/exam-attempts/candidates/${examCandidateId}/grant-attempt`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return res.data;
}

// Public API
export async function fetchActiveExam() {
  try {
    const res = await apiRequest('/exams/active');
    return res.data;
  } catch (error) {
    console.error('Failed to fetch active exam:', error);
    return null;
  }
}
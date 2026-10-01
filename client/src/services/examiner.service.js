import { apiRequest } from './api';
import { getAuthHeaders } from './auth.service';

export async function fetchQuestions(params = {}) {
  const query = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      query.append(key, val);
    }
  }
  const queryString = query.toString();
  const path = `/questions${queryString ? '?' + queryString : ''}`;
  const res = await apiRequest(path, {
    headers: getAuthHeaders(),
  });
  return res.data; // { items, pagination, usageCounts: { exam, practice } }
}

export async function fetchQuestionById(id) {
  const res = await apiRequest(`/questions/${id}`, {
    headers: getAuthHeaders(),
  });
  return res.data;
}

export async function createQuestion(payload) {
  const res = await apiRequest('/questions', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function updateQuestion(id, payload) {
  const res = await apiRequest(`/questions/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function deleteQuestion(id) {
  const res = await apiRequest(`/questions/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return res.data;
}

// usage: 'exam' (thi chính thức) hoặc 'practice' (ôn tập) — bắt buộc, server từ chối nếu thiếu
export async function previewImportQuestions(file, usage) {
  const formData = new FormData();
  formData.append('usage', usage);
  formData.append('file', file);

  const res = await apiRequest('/questions/import/preview', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  return res.data; // { token, usage, totalRows, readyCount, duplicateCount, errorCount, missingDepartments, duplicates, ready, errors }
}

export async function confirmImportQuestionsExcel({ token, createDepartments, keepDuplicateRows, usage }) {
  const res = await apiRequest('/questions/import/confirm', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ token, createDepartments, keepDuplicateRows, usage }),
  });
  return res.data; // { usage, imported, skipped, failed, errors, skippedDuplicates, questionIds }
}

// usage: 'exam' | 'practice' — bắt buộc, giống import Excel. Chỉ nhận file .docx.
export async function previewImportQuestionsWord(file, usage) {
  const formData = new FormData();
  formData.append('usage', usage);
  formData.append('file', file);

  const res = await apiRequest('/questions/import/word/preview', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  return res.data; // giống preview Excel, thêm needsReview: [{ row, content, suggestedCorrect, options }]
}

// correctOverrides: { [soCauTrongWord]: number[] } — đáp án đúng người dùng chọn lại cho các câu trong needsReview
export async function confirmImportQuestionsWord({ token, createDepartments, keepDuplicateRows, usage, correctOverrides }) {
  const res = await apiRequest('/questions/import/word/confirm', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ token, createDepartments, keepDuplicateRows, usage, correctOverrides }),
  });
  return res.data;
}

export async function uploadQuestionImage(file) {
  const formData = new FormData();
  formData.append('image', file);

  const res = await apiRequest('/questions/upload-image', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  return res.data; // { imageUrl, imageCloudinaryId }
}

export async function bulkDeleteQuestions({ ids, filters }) {
  const res = await apiRequest('/questions/bulk-delete', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ ids, filters }),
  });
  return res.data;
}

// Chuyển hàng loạt câu hỏi giữa ngân hàng thi chính thức và ôn tập.
// Truyền ids (các câu đã chọn) HOẶC filters (toàn bộ kết quả lọc); targetUsage: 'exam' | 'practice'.
// Trả về { targetUsage, movedCount, questionIds }.
// Chuyển sang 'practice' bị server chặn (409, code QUESTION_USAGE_ACTIVE_EXAM) nếu có câu thuộc chủ đề đang có kỳ thi phát hành.
export async function bulkMoveQuestionsUsage({ ids, filters, targetUsage }) {
  const res = await apiRequest('/questions/bulk-move-usage', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ ids, filters, targetUsage }),
  });
  return res.data;
}

export async function fetchTopics() {
  const res = await apiRequest('/topics', {
    headers: getAuthHeaders(),
  });
  return res.data;
}

export async function createTopic(payload) {
  const res = await apiRequest('/topics', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  // Giữ nguyên toàn bộ field của topic (bao gồm `restored` từ service) và
  // đính kèm thêm `message` server trả về, để UI phân biệt được trường hợp
  // "khôi phục chủ đề đã xoá mềm" với "tạo chủ đề mới" thay vì hiện chung 1
  // thông báo dễ gây hiểu nhầm.
  return { ...res.data, message: res.message };
}

export async function updateTopic(id, payload) {
  const res = await apiRequest(`/topics/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function deleteTopic(id) {
  const res = await apiRequest(`/topics/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return res.data;
}

export async function fetchDepartments() {
  const res = await apiRequest('/departments', {
    headers: getAuthHeaders(),
  });
  return res.data;
}

export async function createDepartment(payload) {
  const res = await apiRequest('/departments', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function updateDepartment(id, payload) {
  const res = await apiRequest(`/departments/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function deleteDepartment(id) {
  const res = await apiRequest(`/departments/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return res.data;
}

export async function fetchQuestionStatsByTopic(topicId) {
  const res = await apiRequest(`/questions/stats/by-topic/${topicId}`, {
    headers: getAuthHeaders(),
  });
  return res.data;
}

// === EXAM PROPOSALS ===

export async function createExamProposal(payload) {
  const res = await apiRequest('/exams', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function updateExamProposal(examId, payload) {
  const res = await apiRequest(`/exams/${examId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function submitForReview(examId) {
  const res = await apiRequest(`/exams/${examId}/submit`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return res.data;
}

export async function fetchMyExamProposals() {
  const res = await apiRequest('/exams', {
    headers: getAuthHeaders(),
  });
  return res.data;
}
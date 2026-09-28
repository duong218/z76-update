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
  return res.data; // { items, pagination }
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

export async function previewImportQuestions(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await apiRequest('/questions/import/preview', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  return res.data; // { token, totalRows, readyCount, duplicateCount, errorCount, missingDepartments, duplicates, ready, errors }
}

export async function confirmImportQuestionsExcel({ token, createDepartments, keepDuplicateRows }) {
  const res = await apiRequest('/questions/import/confirm', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ token, createDepartments, keepDuplicateRows }),
  });
  return res.data; // { imported, skipped, failed, errors, skippedDuplicates, questionIds }
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
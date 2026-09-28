import { apiRequest, API_BASE_URL } from './api';
import { getAuthHeaders } from './auth.service';

// === EXAMINER / ADMIN / LEADER — quản lý tài liệu ===

export async function fetchStudyDocuments({ topicId } = {}) {
  const query = topicId ? `?topicId=${encodeURIComponent(topicId)}` : '';
  const res = await apiRequest(`/study-documents${query}`, {
    headers: getAuthHeaders(),
  });
  return res.data;
}

export async function uploadStudyDocument({ topicId, title, scope, departmentId, file }) {
  const formData = new FormData();
  formData.append('topicId', topicId);
  if (title) formData.append('title', title);
  formData.append('scope', scope);
  if (departmentId) formData.append('departmentId', departmentId);
  formData.append('file', file);

  const res = await apiRequest('/study-documents', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  return res.data;
}

export async function deleteStudyDocument(id) {
  const res = await apiRequest(`/study-documents/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return res.data;
}

// === CANDIDATE — xem tài liệu ===

export async function fetchMyStudyDocuments({ topicId } = {}) {
  const query = topicId ? `?topicId=${encodeURIComponent(topicId)}` : '';
  const res = await apiRequest(`/study-documents/candidate${query}`, {
    headers: getAuthHeaders(),
  });
  return res.data;
}

// === Xem / tải file ===
//
// KHÔNG dùng apiRequest (trả JSON) hay <a href>/<iframe src> trực tiếp — file
// là nhị phân và cần gửi kèm header Authorization, mà navigation thường
// (mở link/iframe) không tự gắn được header tùy chỉnh. Thay vào đó: fetch
// thủ công kèm header, nhận về Blob, rồi tạo Blob URL để mở tab mới (preview)
// hoặc trigger tải xuống (download).

async function fetchDocumentBlob(id, mode) {
  const response = await fetch(`${API_BASE_URL}/study-documents/${id}/file?mode=${mode}`, {
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    let message = `Không thể tải tài liệu (lỗi ${response.status})`;
    try {
      const body = await response.json();
      message = body?.message || message;
    } catch {
      /* response không phải JSON */
    }
    throw new Error(message);
  }

  return response.blob();
}

/** Mở tài liệu trong tab mới để xem trực tiếp (chủ yếu dùng cho PDF). */
export async function previewStudyDocument(id) {
  const blob = await fetchDocumentBlob(id, 'inline');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  // Thu hồi sau 60s — đủ thời gian tab mới load xong, tránh giữ mãi bộ nhớ.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Tải tài liệu về máy (dùng cho Word/Excel, hoặc PDF nếu người dùng muốn tải). */
export async function downloadStudyDocument(id, filename) {
  const blob = await fetchDocumentBlob(id, 'download');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'tai-lieu';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
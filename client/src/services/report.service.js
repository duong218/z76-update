import { apiRequest, API_BASE_URL } from './api';
import { getAuthHeaders, getAccessToken } from './auth.service';

export const fetchOverviewStats = async () => {
  return apiRequest('/reports/overview', {
    headers: getAuthHeaders(),
  });
};

export const fetchResultsByDepartment = async () => {
  return apiRequest('/reports/by-department', {
    headers: getAuthHeaders(),
  });
};

// MỚI — Thống kê kết quả thi theo Bài thi (exam/topic).
export const fetchResultsByExam = async () => {
  return apiRequest('/reports/by-exam', {
    headers: getAuthHeaders(),
  });
};

// PUBLIC — trang chủ, không đăng nhập. Trả về [{ departmentName, totalSubmissions, passRate }]
export const fetchPublicResultsByDepartment = async () => {
  const res = await apiRequest('/reports/public/by-department');
  return res.data;
};

// PUBLIC — tra cứu theo mã NV hoặc họ tên. Trả về mảng (có thể trùng tên nhiều người).
export const lookupPublicResult = async (query) => {
  const res = await apiRequest(`/reports/public/lookup?q=${encodeURIComponent(query)}`);
  return res.data;
};

export const fetchDetailedResults = async (filters = {}) => {
  const query = new URLSearchParams();
  if (filters.page) query.append('page', filters.page);
  if (filters.limit) query.append('limit', filters.limit);
  if (filters.departmentId) query.append('departmentId', filters.departmentId);
  if (filters.passed !== undefined && filters.passed !== '') query.append('passed', filters.passed);
  if (filters.startDate) query.append('startDate', filters.startDate);
  if (filters.endDate) query.append('endDate', filters.endDate);
  if (filters.search) query.append('search', filters.search);

  return apiRequest(`/reports/results?${query.toString()}`, {
    headers: getAuthHeaders(),
  });
};

// Tách hàm tải blob dùng chung cho các endpoint export (tránh lặp code fetch + tải file)
// LƯU Ý: token được lưu/đọc qua token-store.js (getAccessToken), KHÔNG phải
// localStorage.getItem('token') — trước đây hàm này lấy sai key nên luôn gửi
// request export không kèm Authorization, khiến server trả 401 "Yêu cầu đăng
// nhập" dù người dùng đang đăng nhập bình thường (các API khác vẫn chạy được
// vì chúng dùng getAuthHeaders() đúng cách qua apiRequest).
const downloadReportBlob = async (path, filename) => {
  const token = getAccessToken();
  const headers = {
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Lỗi khi tải file báo cáo');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

export const exportReport = async (filters = {}) => {
  const query = new URLSearchParams();
  if (filters.departmentId) query.append('departmentId', filters.departmentId);
  if (filters.passed !== undefined && filters.passed !== '') query.append('passed', filters.passed);
  if (filters.startDate) query.append('startDate', filters.startDate);
  if (filters.endDate) query.append('endDate', filters.endDate);
  if (filters.search) query.append('search', filters.search);

  await downloadReportBlob(`/reports/export?${query.toString()}`, 'ket_qua_thi.xlsx');
};

// MỚI — Xuất Excel thống kê + chi tiết kết quả thi theo Bài thi (exam/topic).
export const exportReportByExam = async () => {
  await downloadReportBlob('/reports/export-by-exam', 'ket_qua_thi_theo_bai_thi.xlsx');
};

// MỚI — Lịch sử kết quả thi của chính thí sinh đang đăng nhập (role 'candidate').
// Trả về { employee: { fullname, employeeCode, departmentName } | null, results: [...] }
export const fetchMyResults = async () => {
  const res = await apiRequest('/reports/my-results', {
    headers: getAuthHeaders(),
  });
  return res.data;
};
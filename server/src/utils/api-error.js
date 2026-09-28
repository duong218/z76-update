/**
 * Tiện ích định nghĩa mã lỗi chuẩn (ApiError) và các hàm assert dữ liệu.
 */

// Lớp đối tượng lỗi nghiệp vụ tùy chỉnh, kèm HTTP status code và mã lỗi nghiệp vụ (code)
export class ApiError extends Error {
  constructor(statusCode, message, code = 'API_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

// Hàm kiểm tra tồn tại bản ghi trong CSDL; ném lỗi 404 NOT_FOUND nếu không tìm thấy
export function assertFound(doc, message = 'Không tìm thấy', code = 'NOT_FOUND') {
  if (!doc) {
    throw new ApiError(404, message, code);
  }
  return doc;
}


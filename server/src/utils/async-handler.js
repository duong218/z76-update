/**
 * Tiện ích bọc các async middleware / route handler trong Express.
 * Tự động bắt promise rejection và chuyển lỗi tới global error handler thông qua `next(err)`,
 * giúp tránh việc phải lặp lại cấu trúc try/catch trong các controller.
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}


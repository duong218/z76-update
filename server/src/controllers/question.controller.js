/**
 * Controller Quản lý Ngân hàng Câu hỏi & Đáp án (Question Bank Management).
 * Hỗ trợ tạo mới, cập nhật, xóa đơn/hàng loạt, upload ảnh đề thi lên Cloudinary và import câu hỏi từ file Excel.
 */

import * as questionService from '../services/question.service.js';
import { writeAudit } from '../services/audit.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ApiError } from '../utils/api-error.js';
import {
  ANSWER_TYPE,
  DIFFICULTY,
  QUESTION_KIND,
  QUESTION_SCOPE,
} from '../models/constants.js';

// Hàm phụ trợ lấy địa chỉ IP của client
function clientIp(req) {
  return req.ip ?? req.headers['x-forwarded-for']?.toString()?.split(',')[0]?.trim();
}

// Hàm kiểm tra hợp lệ dữ liệu enum khi tạo mới câu hỏi
function parseCreateBody(body) {
  const {
    content,
    questionKind,
    answerType,
    difficulty,
    scope,
    topicId,
    departmentId,
    imageUrl,
    imageCloudinaryId,
    answers,
  } = body ?? {};

  const enums = [
    [questionKind, Object.values(QUESTION_KIND), 'questionKind'],
    [answerType, Object.values(ANSWER_TYPE), 'answerType'],
    [difficulty, Object.values(DIFFICULTY), 'difficulty'],
    [scope, Object.values(QUESTION_SCOPE), 'scope'],
  ];
  for (const [val, allowed, label] of enums) {
    if (!allowed.includes(val)) {
      throw new ApiError(400, `${label} không hợp lệ`, 'QUESTION_VALIDATION');
    }
  }

  return {
    content,
    questionKind,
    answerType,
    difficulty,
    scope,
    topicId,
    departmentId,
    imageUrl,
    imageCloudinaryId,
    answers,
  };
}

// Lấy danh sách câu hỏi kèm phân trang và bộ lọc (theo chủ đề, độ khó, phạm vi, từ khóa)
export const list = asyncHandler(async (req, res) => {
  const data = await questionService.listQuestions({
    topicId: req.query.topicId,
    scope: req.query.scope,
    departmentId: req.query.departmentId,
    questionKind: req.query.questionKind,
    difficulty: req.query.difficulty,
    answerType: req.query.answerType,
    isActive: req.query.isActive ?? true,
    search: req.query.search,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.json({ success: true, message: 'OK', code: 'QUESTION_LIST_OK', data });
});

// Lấy thông tin chi tiết một câu hỏi theo ID
export const getById = asyncHandler(async (req, res) => {
  const data = await questionService.getQuestionById(req.params.id);
  res.json({ success: true, message: 'OK', code: 'QUESTION_GET_OK', data });
});

// Tạo mới câu hỏi thủ công kèm danh sách đáp án
export const create = asyncHandler(async (req, res) => {
  const payload = parseCreateBody(req.body);
  const data = await questionService.createQuestion(payload, req.auth.userId);

  await writeAudit({
    actorUserId: req.auth.userId,
    action: 'CREATE_QUESTION',
    resourceType: 'Question',
    resourceId: data.id,
    metadata: { detail: `Tạo câu hỏi mới (ID: ${data.id})` },
    ipAddress: clientIp(req),
  });

  res.status(201).json({
    success: true,
    message: 'Tạo câu hỏi thành công',
    code: 'QUESTION_CREATED',
    data,
  });
});

// Tải ảnh minh họa cho câu hỏi lên Cloudinary
export const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) {
    throw new ApiError(400, 'Thiếu file ảnh (field: image)', 'IMAGE_FILE_MISSING');
  }
  const data = await questionService.uploadQuestionImageBuffer(req.file.buffer);
  res.json({
    success: true,
    message: 'Tải ảnh lên thành công',
    code: 'QUESTION_IMAGE_UPLOADED',
    data,
  });
});

// Cập nhật nội dung câu hỏi và các lựa chọn đáp án
export const update = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  if (payload.questionKind && !Object.values(QUESTION_KIND).includes(payload.questionKind)) {
    throw new ApiError(400, 'questionKind không hợp lệ', 'QUESTION_VALIDATION');
  }
  if (payload.answerType && !Object.values(ANSWER_TYPE).includes(payload.answerType)) {
    throw new ApiError(400, 'answerType không hợp lệ', 'QUESTION_VALIDATION');
  }
  if (payload.difficulty && !Object.values(DIFFICULTY).includes(payload.difficulty)) {
    throw new ApiError(400, 'difficulty không hợp lệ', 'QUESTION_VALIDATION');
  }
  if (payload.scope && !Object.values(QUESTION_SCOPE).includes(payload.scope)) {
    throw new ApiError(400, 'scope không hợp lệ', 'QUESTION_VALIDATION');
  }

  const data = await questionService.updateQuestion(
    req.params.id,
    payload,
    req.auth.userId,
    clientIp(req),
  );

  await writeAudit({
    actorUserId: req.auth.userId,
    action: 'UPDATE_QUESTION',
    resourceType: 'Question',
    resourceId: req.params.id,
    metadata: { detail: `Cập nhật câu hỏi (ID: ${req.params.id})` },
    ipAddress: clientIp(req),
  });
  res.json({
    success: true,
    message: 'Cập nhật câu hỏi thành công',
    code: 'QUESTION_UPDATED',
    data,
  });
});

// Xóa (vô hiệu hóa) một câu hỏi
export const remove = asyncHandler(async (req, res) => {
  const data = await questionService.deactivateQuestion(
    req.params.id,
    req.auth.userId,
    clientIp(req),
  );

  await writeAudit({
    actorUserId: req.auth.userId,
    action: 'DELETE_QUESTION',
    resourceType: 'Question',
    resourceId: req.params.id,
    metadata: { detail: `Xóa / Ngừng sử dụng câu hỏi (ID: ${req.params.id})` },
    ipAddress: clientIp(req),
  });
  res.json({
    success: true,
    message: 'Đã ngừng sử dụng câu hỏi',
    code: 'QUESTION_DEACTIVATED',
    data,
  });
});

// Xóa nhiều câu hỏi cùng lúc (bỏ qua những câu đang được dùng trong kỳ thi đang diễn ra)
export const bulkRemove = asyncHandler(async (req, res) => {
  const { ids, filters } = req.body ?? {};
  const data = await questionService.deactivateManyQuestions({ ids, filters }, req.auth.userId, clientIp(req));

  await writeAudit({
    actorUserId: req.auth.userId,
    action: 'BULK_DELETE_QUESTIONS',
    resourceType: 'Question',
    metadata: {
      detail: data.skippedActiveExam
        ? `Xóa hàng loạt câu hỏi (${data.deactivatedCount} câu; giữ lại ${data.skippedActiveExam.skippedCount} câu vì đang dùng cho kỳ thi "${data.skippedActiveExam.examTitle}" đang diễn ra)`
        : `Xóa hàng loạt câu hỏi (${data.deactivatedCount} câu)`,
    },
    ipAddress: clientIp(req),
  });

  const message = data.skippedActiveExam
    ? `Đã ngừng sử dụng ${data.deactivatedCount} câu hỏi. Giữ lại ${data.skippedActiveExam.skippedCount} câu vì đang được dùng cho kỳ thi "${data.skippedActiveExam.examTitle}" đang diễn ra — vui lòng đợi kỳ thi kết thúc rồi thử lại.`
    : `Đã ngừng sử dụng ${data.deactivatedCount} câu hỏi`;

  res.json({
    success: true,
    message,
    code: data.skippedActiveExam ? 'QUESTION_BULK_DEACTIVATED_PARTIAL' : 'QUESTION_BULK_DEACTIVATED',
    data,
  });
});

// Thống kê số lượng câu hỏi theo từng mức độ khó trong một chủ đề
export const getStatsByTopic = asyncHandler(async (req, res) => {
  const data = await questionService.getQuestionStatsByTopic(req.params.topicId);
  res.json({ success: true, message: 'OK', code: 'QUESTION_STATS_OK', data });
});

// Bước 1 Import câu hỏi từ file Excel: Đọc file và tạo bản xem trước
export const previewImport = asyncHandler(async (req, res) => {
  if (!req.file?.path) {
    throw new ApiError(400, 'Thiếu file Excel (field: file)', 'IMPORT_FILE_MISSING');
  }
  const data = await questionService.previewImportQuestionsFromExcelFile(req.file.path);
  res.json({
    success: true,
    message: 'Đã phân tích file, vui lòng xem lại trước khi xác nhận',
    code: 'QUESTION_IMPORT_PREVIEW_OK',
    data,
  });
});

// Bước 2 Import câu hỏi từ file Excel: Lưu danh sách câu hỏi hợp lệ vào CSDL
export const confirmImport = asyncHandler(async (req, res) => {
  const { token, createDepartments, keepDuplicateRows } = req.body ?? {};
  if (!token) {
    throw new ApiError(400, 'Thiếu token phiên import (hãy preview lại)', 'IMPORT_TOKEN_MISSING');
  }
  const data = await questionService.confirmImportQuestions(
    token,
    { createDepartments, keepDuplicateRows },
    req.auth.userId,
    req.auth.userId,
    clientIp(req),
  );

  await writeAudit({
    actorUserId: req.auth.userId,
    action: 'IMPORT_QUESTIONS',
    resourceType: 'Question',
    metadata: { detail: `Import câu hỏi từ Excel (Thành công: ${data.imported}, Lỗi: ${data.failed}, Bỏ qua trùng: ${data.skipped})` },
    ipAddress: clientIp(req),
  });
  res.json({
    success: true,
    message: `Import xong: ${data.imported} thành công, ${data.skipped} bỏ qua (trùng), ${data.failed} lỗi`,
    code: 'QUESTION_IMPORT_DONE',
    data,
  });
});
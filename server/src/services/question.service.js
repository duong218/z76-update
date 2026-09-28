/**
 * Service Quản lý Ngân hàng Câu hỏi & Import Excel (Question Service).
 * Xử lý: CRUD câu hỏi & đáp án, Upload/Xóa ảnh Cloudinary với băm SHA-256 chống trùng lặp, Preview & Xác nhận Import Excel thông minh, và Thống kê cơ cấu câu hỏi.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import XLSX from 'xlsx';
import { v2 as cloudinary } from 'cloudinary';
import {
  ANSWER_TYPE,
  DIFFICULTY,
  QUESTION_KIND,
  QUESTION_SCOPE,
  EXAM_STATUS,
  Answer,
  Question,
  Department,
  Exam,
} from '../models/index.js';
import { ApiError, assertFound } from '../utils/api-error.js';
import { findDepartmentByName, findOrCreateDepartmentByName, upsertDepartmentForImport } from './department.service.js';
import { normalizeDeptName } from '../models/department.model.js';
import { findOrCreateTopicByName } from './topic.service.js';
import { env } from '../config/env.js';

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
});

const CLOUDINARY_QUESTION_FOLDER = 'z176/questions';

// Stream upload buffer ảnh lên Cloudinary
function uploadBufferToCloudinary(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, overwrite: true, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    stream.end(buffer);
  });
}

// Upload ảnh câu hỏi lên Cloudinary (Đặt public_id theo mã băm SHA-256 để chống trùng lặp bộ nhớ)
export async function uploadQuestionImageBuffer(buffer) {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const publicId = `${CLOUDINARY_QUESTION_FOLDER}/${hash}`;
  const result = await uploadBufferToCloudinary(buffer, publicId);
  return { imageUrl: result.secure_url, imageCloudinaryId: result.public_id };
}

// Xóa ảnh câu hỏi trên Cloudinary theo public_id
async function deleteQuestionImage(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    console.error('Cloudinary destroy thất bại:', publicId, err.message);
  }
}

// Chuẩn hóa chuỗi tiêu đề cột Excel (chuyển chữ thường, bỏ dấu tiếng Việt và ký tự đặc biệt)
function normalizeKey(key) {
  return String(key ?? '')
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '');
}

// Chuẩn hóa nội dung văn bản câu hỏi phục vụ kiểm tra trùng lặp dữ liệu import
function normalizeContentForDedupe(content) {
  return String(content ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// Xây dựng map ánh xạ enum từ nhiều biến thể nhập liệu khác nhau sang giá trị chuẩn
function buildNormalizedMap(pairs) {
  const out = {};
  for (const [rawKeys, value] of pairs) {
    for (const k of rawKeys) {
      out[normalizeKey(k)] = value;
    }
  }
  return out;
}

const DIFFICULTY_MAP = buildNormalizedMap([
  [['easy', 'dễ', 'de'], DIFFICULTY.EASY],
  [['medium', 'trung bình', 'trung binh', 'tb'], DIFFICULTY.MEDIUM],
  [['hard', 'khó', 'kho'], DIFFICULTY.HARD],
]);

const KIND_MAP = buildNormalizedMap([
  [['theory', 'lý thuyết', 'ly thuyet'], QUESTION_KIND.THEORY],
  [['practice', 'bài tập', 'bai tap'], QUESTION_KIND.PRACTICE],
]);

const ANSWER_TYPE_MAP = buildNormalizedMap([
  [['single', 'single choice', 'chọn 1', 'chon 1'], ANSWER_TYPE.SINGLE],
  [['multiple', 'multiple choice', 'chọn nhiều', 'chon nhieu'], ANSWER_TYPE.MULTIPLE],
]);

const SCOPE_MAP = buildNormalizedMap([
  [['common', 'chung'], QUESTION_SCOPE.COMMON],
  [['departmentspecific', 'department', 'riêng', 'rieng'], QUESTION_SCOPE.DEPARTMENT_SPECIFIC],
]);

// Chuẩn hóa tên toàn bộ các thuộc tính (keys) của một dòng Excel
function mapRowKeys(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[normalizeKey(k)] = v;
  }
  return out;
}

// Parse danh sách chỉ số đáp án đúng từ chuỗi nhập liệu (hỗ trợ phân tách bằng dấu phẩy, chấm phẩy, xuyệt)
function parseCorrectIndices(raw) {
  if (raw == null || raw === '') return [];
  const s = String(raw).trim();
  const parts = s.split(/[,;|/]/).map((p) => p.trim()).filter(Boolean);
  const indices = [];
  for (const p of parts) {
    const n = Number.parseInt(p, 10);
    if (!Number.isNaN(n) && n >= 1) {
      indices.push(n);
    }
  }
  return [...new Set(indices)];
}

// Kiểm tra tính hợp lệ của tập hợp phương án trả lời (Số lượng tối thiểu, số đáp án đúng theo Single / Multiple)
export function validateAnswerSet(answerType, answers) {
  if (!Array.isArray(answers) || answers.length < 2) {
    throw new ApiError(400, 'Cần ít nhất 2 phương án trả lời', 'QUESTION_ANSWERS_MIN');
  }
  const correct = answers.filter((a) => a.isCorrect);
  if (answerType === ANSWER_TYPE.SINGLE && correct.length !== 1) {
    throw new ApiError(400, 'Câu single choice cần đúng 1 đáp án đúng', 'QUESTION_SINGLE_CORRECT');
  }
  if (answerType === ANSWER_TYPE.MULTIPLE && correct.length < 1) {
    throw new ApiError(400, 'Câu multiple choice cần ít nhất 1 đáp án đúng', 'QUESTION_MULTI_CORRECT');
  }
}

// Serialize câu hỏi và danh sách đáp án sang định dạng JSON hoàn chỉnh
function serializeQuestion(doc, answers) {
  return {
    id: doc._id.toString(),
    content: doc.content,
    questionKind: doc.questionKind,
    answerType: doc.answerType,
    difficulty: doc.difficulty,
    scope: doc.scope,
    topicId: doc.topicId?.toString(),
    departmentId: doc.departmentId?.toString(),
    imageUrl: doc.imageUrl,
    imageCloudinaryId: doc.imageCloudinaryId,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    answers: answers.map((a) => ({
      id: a._id.toString(),
      content: a.content,
      isCorrect: a.isCorrect,
      sortOrder: a.sortOrder,
    })),
  };
}

// Dựng truy vấn lọc câu hỏi theo nhiều tiêu chí
function buildQuestionQuery(filters = {}) {
  const { topicId, scope, departmentId, questionKind, difficulty, answerType, isActive = true, search } = filters;
  const query = {};
  if (isActive !== undefined && isActive !== 'all') {
    query.isActive = isActive === true || isActive === 'true';
  }
  if (topicId) query.topicId = topicId;
  if (scope) query.scope = scope;
  if (departmentId) query.departmentId = departmentId;
  if (questionKind) query.questionKind = questionKind;
  if (difficulty) query.difficulty = difficulty;
  if (answerType) query.answerType = answerType;
  if (search?.trim()) {
    query.content = { $regex: search.trim(), $options: 'i' };
  }
  return query;
}

// Lấy danh sách câu hỏi kèm phân trang và nạp danh sách đáp án
export async function listQuestions(filters = {}) {
  const { page = 1, limit = 20 } = filters;
  const query = buildQuestionQuery(filters);

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    Question.find(query).sort({ updatedAt: -1 }).skip(skip).limit(safeLimit).lean(),
    Question.countDocuments(query),
  ]);

  const ids = items.map((q) => q._id);
  const answers = await Answer.find({ questionId: { $in: ids } }).sort({ sortOrder: 1 }).lean();
  const byQuestion = new Map();
  for (const a of answers) {
    const key = a.questionId.toString();
    if (!byQuestion.has(key)) byQuestion.set(key, []);
    byQuestion.get(key).push(a);
  }

  return {
    items: items.map((q) => serializeQuestion(q, byQuestion.get(q._id.toString()) ?? [])),
    pagination: { page: safePage, limit: safeLimit, total },
  };
}

// Lấy chi tiết một câu hỏi theo ID
export async function getQuestionById(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, 'ID câu hỏi không hợp lệ', 'QUESTION_ID_INVALID');
  }
  const question = await Question.findById(id);
  assertFound(question, 'Không tìm thấy câu hỏi', 'QUESTION_NOT_FOUND');
  const answers = await Answer.find({ questionId: question._id }).sort({ sortOrder: 1 });
  return serializeQuestion(question, answers);
}

// Ghi đè toàn bộ danh sách đáp án của một câu hỏi
async function replaceAnswers(questionId, answersInput) {
  await Answer.deleteMany({ questionId });
  const toInsert = answersInput.map((a, index) => ({
    questionId,
    content: a.content.trim(),
    isCorrect: Boolean(a.isCorrect),
    sortOrder: a.sortOrder ?? index,
  }));
  await Answer.insertMany(toInsert);
}


// Tạo mới một câu hỏi kèm các đáp án lựa chọn
export async function createQuestion(payload, createdBy) {
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
  } = payload;

  if (!content?.trim()) {
    throw new ApiError(400, 'Nội dung câu hỏi là bắt buộc', 'QUESTION_VALIDATION');
  }
  if (!topicId) {
    throw new ApiError(400, 'topicId là bắt buộc', 'QUESTION_VALIDATION');
  }

  validateAnswerSet(answerType, answers);

  const question = await Question.create({
    content: content.trim(),
    questionKind,
    answerType,
    difficulty,
    scope,
    topicId,
    departmentId: scope === QUESTION_SCOPE.DEPARTMENT_SPECIFIC ? departmentId : undefined,
    imageUrl,
    imageCloudinaryId,
    createdBy,
  });

  await replaceAnswers(question._id, answers);
  return getQuestionById(question._id);
}

// Cập nhật thông tin câu hỏi, đáp án và đồng bộ xóa ảnh cũ trên Cloudinary
export async function updateQuestion(id, payload, actorUserId, ipAddress) {
  const question = await Question.findById(id);
  assertFound(question, 'Không tìm thấy câu hỏi', 'QUESTION_NOT_FOUND');

  const previousCloudinaryId = question.imageCloudinaryId;

  const fields = [
    'content',
    'questionKind',
    'answerType',
    'difficulty',
    'scope',
    'topicId',
    'departmentId',
    'imageUrl',
    'imageCloudinaryId',
    'isActive',
  ];
  for (const f of fields) {
    if (payload[f] !== undefined) question[f] = payload[f];
  }
  if (question.scope === QUESTION_SCOPE.COMMON) {
    question.departmentId = undefined;
  }

  if (payload.answers) {
    validateAnswerSet(question.answerType, payload.answers);
  }

  await question.save();

  if (payload.answers) {
    await replaceAnswers(question._id, payload.answers);
  }

  if (
    payload.imageCloudinaryId !== undefined &&
    previousCloudinaryId &&
    previousCloudinaryId !== question.imageCloudinaryId
  ) {
    await deleteQuestionImage(previousCloudinaryId);
  }

  return getQuestionById(question._id);
}

// Kiểm tra xem có kỳ thi PUBLISHED nào đang sử dụng các chủ đề này không
async function findActiveExamUsingTopics(topicIds) {
  const ids = [...new Set(topicIds.filter(Boolean).map((id) => id.toString()))];
  if (ids.length === 0) return null;
  return Exam.findOne({ topicId: { $in: ids }, status: EXAM_STATUS.PUBLISHED });
}

// Ngừng kích hoạt (xóa mềm) một câu hỏi (chặn nếu thuộc chủ đề có kỳ thi đang mở)
export async function deactivateQuestion(id, actorUserId, ipAddress) {
  const question = await Question.findById(id);
  assertFound(question, 'Không tìm thấy câu hỏi', 'QUESTION_NOT_FOUND');

  const activeExam = await findActiveExamUsingTopics([question.topicId]);
  if (activeExam) {
    throw new ApiError(
      409,
      `Không thể ngừng sử dụng câu hỏi này vì chủ đề của câu hỏi đang được dùng cho kỳ thi "${activeExam.title}" đang diễn ra (áp dụng cho toàn bộ câu hỏi trong chủ đề, kể cả câu chưa được đưa vào đề). Vui lòng đợi kỳ thi kết thúc rồi thử lại.`,
      'QUESTION_HAS_ACTIVE_EXAM',
    );
  }

  question.isActive = false;
  await question.save();

  return { id: question._id.toString(), isActive: false };
}

// Xóa mềm hàng loạt câu hỏi (theo danh sách IDs hoặc theo Bộ lọc hiện tại)
export async function deactivateManyQuestions({ ids, filters } = {}, actorUserId, ipAddress) {
  let query;
  if (Array.isArray(ids) && ids.length > 0) {
    const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
    if (validIds.length === 0) {
      throw new ApiError(400, 'Danh sách ID không hợp lệ', 'QUESTION_BULK_DELETE_INVALID_IDS');
    }
    query = { _id: { $in: validIds }, isActive: true };
  } else if (filters && typeof filters === 'object') {
    const hasSpecificFilter = ['topicId', 'scope', 'departmentId', 'questionKind', 'difficulty', 'answerType', 'search']
      .some((k) => filters[k] !== undefined && filters[k] !== null && filters[k] !== '');
    if (!hasSpecificFilter) {
      throw new ApiError(
        400,
        'Vui lòng chọn ít nhất 1 bộ lọc (chủ đề, phạm vi, bộ phận, độ khó...) trước khi xóa tất cả, để tránh xóa nhầm toàn bộ ngân hàng câu hỏi.',
        'QUESTION_BULK_DELETE_NO_FILTER',
      );
    }
    query = buildQuestionQuery({ ...filters, isActive: true });
  } else {
    throw new ApiError(400, 'Thiếu ids hoặc filters để xóa hàng loạt', 'QUESTION_BULK_DELETE_MISSING_PARAMS');
  }

  const matched = await Question.find(query).select('topicId').lean();
  if (matched.length === 0) {
    return { deactivatedCount: 0, questionIds: [], skippedActiveExam: null };
  }

  const topicIds = [...new Set(matched.map((q) => q.topicId?.toString()).filter(Boolean))];
  const activeExams = await Exam.find({ topicId: { $in: topicIds }, status: EXAM_STATUS.PUBLISHED })
    .select('topicId title')
    .lean();

  const blockedTopicIds = new Set(activeExams.map((e) => e.topicId.toString()));
  const blocked = matched.filter((q) => blockedTopicIds.has(q.topicId?.toString()));
  const idsToDeactivate = matched
    .filter((q) => !blockedTopicIds.has(q.topicId?.toString()))
    .map((q) => q._id);

  if (idsToDeactivate.length > 0) {
    await Question.updateMany({ _id: { $in: idsToDeactivate } }, { $set: { isActive: false } });
  }

  return {
    deactivatedCount: idsToDeactivate.length,
    questionIds: idsToDeactivate.map((id) => id.toString()),
    skippedActiveExam:
      blocked.length > 0
        ? { examTitle: activeExams.map((e) => e.title).join(', '), skippedCount: blocked.length }
        : null,
  };
}

// Ánh xạ giá trị text từ Excel sang hằng số Enum tương ứng
function resolveEnum(map, raw, fieldLabel) {
  const key = normalizeKey(raw);
  const val = map[key];
  if (!val) {
    throw new ApiError(400, `Giá trị không hợp lệ: ${fieldLabel}`, 'IMPORT_ROW_INVALID');
  }
  return val;
}

// Xử lý đọc & parse dữ liệu của 1 dòng Excel thành object câu hỏi hoàn chỉnh
async function buildQuestionFromImportRow(row, rowIndex) {
  const r = mapRowKeys(row);
  const topicName = r.topic ?? r.chude ?? r.chudelon ?? r.topicname;
  const content = r.content ?? r.noidung ?? r.cauhoi;
  if (!topicName || !content) {
    throw new ApiError(
      400,
      `Dòng ${rowIndex}: thiếu chủ đề hoặc nội dung câu hỏi`,
      'IMPORT_ROW_INVALID',
    );
  }

  const topic = await findOrCreateTopicByName(String(topicName));

  const scope = resolveEnum(SCOPE_MAP, r.scope ?? r.phamvi ?? 'common', 'scope');
  let departmentId;
  if (scope === QUESTION_SCOPE.DEPARTMENT_SPECIFIC) {
    const deptName = r.department ?? r.bophan ?? r.bophanname;
    if (!deptName) {
      throw new ApiError(
        400,
        `Dòng ${rowIndex}: scope riêng cần tên bộ phận`,
        'IMPORT_ROW_INVALID',
      );
    }
    const dept = await findDepartmentByName(String(deptName));
    if (!dept) {
      const err = new ApiError(
        400,
        `Dòng ${rowIndex}: không tìm thấy bộ phận "${deptName}"`,
        'IMPORT_DEPARTMENT_NOT_FOUND',
      );
      err.departmentName = String(deptName).trim();
      err.departmentCode = String(r.mabophan ?? r.maboph ?? r.deptcode ?? '').trim();
      err.departmentDescription = String(r.motabophan ?? r.mota ?? r.deptdescription ?? '').trim();
      throw err;
    }
    departmentId = dept._id;
  }

  const questionKind = resolveEnum(
    KIND_MAP,
    r.questionkind ?? r.loai ?? r.kind ?? 'theory',
    'questionKind',
  );
  const answerType = resolveEnum(
    ANSWER_TYPE_MAP,
    r.answertype ?? r.dapan ?? r.answer_type ?? 'single',
    'answerType',
  );
  const difficulty = resolveEnum(
    DIFFICULTY_MAP,
    r.difficulty ?? r.dokho ?? 'medium',
    'difficulty',
  );

  const options = [];
  for (let i = 1; i <= 8; i += 1) {
    const key = `option${i}`;
    const alt = `luachon${i}`;
    const val = r[key] ?? r[alt];
    if (val != null && String(val).trim() !== '') {
      options.push({ index: i, content: String(val).trim() });
    }
  }
  if (options.length < 2) {
    throw new ApiError(400, `Dòng ${rowIndex}: cần ít nhất 2 phương án`, 'IMPORT_ROW_INVALID');
  }

  const correctRaw = r.correct ?? r.dapanung ?? r.correctoptions ?? r.dapandung;
  const correctIndices = parseCorrectIndices(correctRaw);
  if (correctIndices.length === 0) {
    throw new ApiError(400, `Dòng ${rowIndex}: thiếu đáp án đúng (correct)`, 'IMPORT_ROW_INVALID');
  }

  const answers = options.map((o) => ({
    content: o.content,
    isCorrect: correctIndices.includes(o.index),
    sortOrder: o.index - 1,
  }));

  validateAnswerSet(answerType, answers);

  return {
    content: String(content).trim(),
    questionKind,
    answerType,
    difficulty,
    scope,
    topicId: topic._id,
    departmentId,
    answers,
  };
}

// Đọc toàn bộ các dòng dữ liệu từ file Excel
function readImportRows(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new ApiError(400, 'Không đọc được file upload', 'IMPORT_FILE_MISSING');
  }

  let workbook;
  try {
    workbook = XLSX.readFile(filePath, { cellDates: false });
  } catch (err) {
    throw new ApiError(
      400,
      'File không đúng định dạng Excel hoặc đã bị hỏng. Vui lòng kiểm tra lại file (.xlsx) và tải lên lại.',
      'IMPORT_INVALID_FORMAT',
    );
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new ApiError(400, 'File Excel không có sheet', 'IMPORT_EMPTY');
  }
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (!rows.length) {
    throw new ApiError(400, 'Sheet trống', 'IMPORT_EMPTY');
  }
  return rows;
}

// Nạp tập hợp các khóa định danh câu hỏi đã tồn tại trong DB để check trùng lặp
async function loadSeenKeys() {
  const existingQuestions = await Question.find({ isActive: true }, 'content topicId scope departmentId').lean();
  return new Set(
    existingQuestions.map((q) =>
      [
        q.topicId?.toString() ?? '',
        q.scope,
        q.departmentId?.toString() ?? '',
        normalizeContentForDedupe(q.content),
      ].join('|'),
    ),
  );
}

// Sinh chuỗi khóa định danh cho câu hỏi
function buildDedupeKey(payload) {
  return [
    payload.topicId?.toString() ?? '',
    payload.scope,
    payload.departmentId?.toString() ?? '',
    normalizeContentForDedupe(payload.content),
  ].join('|');
}

// Xác thực và lấy đường dẫn file tạm theo Token upload
function resolveImportTokenPath(token) {
  const safe = path.basename(String(token ?? ''));
  if (!safe || safe !== token) {
    throw new ApiError(400, 'Token import không hợp lệ', 'IMPORT_TOKEN_INVALID');
  }
  return path.join(path.resolve(env.uploadDir), safe);
}

// Bước 1: Xem trước (Preview) Import Excel: Phân tích các dòng hợp lệ, dòng trùng lặp, thiếu phòng ban và dòng lỗi
export async function previewImportQuestionsFromExcelFile(filePath) {
  const rows = readImportRows(filePath);
  const seenKeys = await loadSeenKeys();

  const ready = [];
  const duplicates = [];
  const errors = [];
  const missingDepts = new Map();

  for (let i = 0; i < rows.length; i += 1) {
    const rowIndex = i + 2;
    try {
      const payload = await buildQuestionFromImportRow(rows[i], rowIndex);
      const dedupeKey = buildDedupeKey(payload);
      if (seenKeys.has(dedupeKey)) {
        duplicates.push({ row: rowIndex, content: payload.content.slice(0, 120) });
      } else {
        seenKeys.add(dedupeKey);
        ready.push({ row: rowIndex, content: payload.content.slice(0, 120) });
      }
    } catch (err) {
      if (err.code === 'IMPORT_DEPARTMENT_NOT_FOUND') {
        const key = normalizeDeptName(err.departmentName);
        const entry = missingDepts.get(key) ?? {
          name: err.departmentName,
          code: '',
          description: '',
          rowCount: 0,
        };
        entry.rowCount += 1;
        if (!entry.code && err.departmentCode) entry.code = err.departmentCode;
        if (!entry.description && err.departmentDescription) entry.description = err.departmentDescription;
        missingDepts.set(key, entry);
      }
      errors.push({
        row: rowIndex,
        message: err.message ?? 'Lỗi không xác định',
        code: err.code ?? 'IMPORT_ROW_ERROR',
      });
    }
  }

  return {
    token: path.basename(filePath),
    totalRows: rows.length,
    readyCount: ready.length,
    duplicateCount: duplicates.length,
    errorCount: errors.length,
    missingDepartments: [...missingDepts.values()],
    duplicates,
    ready,
    errors,
  };
}

// Bước 2: Xác nhận (Confirm) Import Excel vào CSDL và tự động tạo phòng ban mới nếu được chọn
export async function confirmImportQuestions(token, options, createdBy, actorUserId, ipAddress) {
  const { createDepartments = [], keepDuplicateRows = [] } = options ?? {};
  const filePath = resolveImportTokenPath(token);
  if (!fs.existsSync(filePath)) {
    throw new ApiError(
      400,
      'Phiên import đã hết hạn hoặc đã được xử lý, vui lòng tải file lên lại',
      'IMPORT_TOKEN_EXPIRED',
    );
  }

  for (const dept of createDepartments) {
    const name = dept?.name?.trim();
    if (!name) continue;

    const code = dept?.code?.trim();
    if (!code) {
      throw new ApiError(
        400,
        `Vui lòng nhập mã bộ phận cho "${name}" trước khi import, hoặc bỏ tick "Tạo bộ phận mới" để bỏ qua các câu hỏi riêng của bộ phận này.`,
        'IMPORT_DEPARTMENT_CODE_REQUIRED',
      );
    }

    try {
      await upsertDepartmentForImport({ name, code, description: dept?.description });
    } catch (err) {
      throw err;
    }
  }

  const rows = readImportRows(filePath);
  const seenKeys = await loadSeenKeys();
  const keepSet = new Set(keepDuplicateRows);

  const created = [];
  const errors = [];
  const skippedDuplicates = [];

  for (let i = 0; i < rows.length; i += 1) {
    const rowIndex = i + 2;
    try {
      const payload = await buildQuestionFromImportRow(rows[i], rowIndex);
      const dedupeKey = buildDedupeKey(payload);

      if (seenKeys.has(dedupeKey) && !keepSet.has(rowIndex)) {
        skippedDuplicates.push({ row: rowIndex, content: payload.content.slice(0, 80) });
        continue;
      }

      const question = await Question.create({
        content: payload.content,
        questionKind: payload.questionKind,
        answerType: payload.answerType,
        difficulty: payload.difficulty,
        scope: payload.scope,
        topicId: payload.topicId,
        departmentId: payload.departmentId,
        createdBy,
      });
      await replaceAnswers(question._id, payload.answers);
      created.push(question._id.toString());
      seenKeys.add(dedupeKey);
    } catch (err) {
      errors.push({
        row: rowIndex,
        message: err.message ?? 'Lỗi không xác định',
        code: err.code ?? 'IMPORT_ROW_ERROR',
      });
    }
  }

  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore cleanup */
  }

  return {
    imported: created.length,
    failed: errors.length,
    skipped: skippedDuplicates.length,
    errors,
    skippedDuplicates,
    questionIds: created,
  };
}

// Thống kê cơ cấu câu hỏi khả dụng (Chung và Theo phòng ban) của một chủ đề phục vụ tạo kỳ thi
export async function getQuestionStatsByTopic(topicId) {
  if (!mongoose.isValidObjectId(topicId)) {
    throw new ApiError(400, 'topicId không hợp lệ', 'QUESTION_STATS_INVALID_TOPIC');
  }

  const [commonCount, deptCountsRaw, departments] = await Promise.all([
    Question.countDocuments({
      topicId,
      scope: QUESTION_SCOPE.COMMON,
      isActive: true,
    }),
    Question.aggregate([
      {
        $match: {
          topicId: new mongoose.Types.ObjectId(topicId),
          scope: QUESTION_SCOPE.DEPARTMENT_SPECIFIC,
          isActive: true,
        },
      },
      { $group: { _id: '$departmentId', count: { $sum: 1 } } },
    ]),
    Department.find({ isActive: true }).sort({ name: 1 }).lean(),
  ]);

  const countByDeptId = new Map(deptCountsRaw.map((d) => [d._id.toString(), d.count]));

  return {
    topicId,
    commonCount,
    departments: departments.map((dept) => ({
      departmentId: dept._id.toString(),
      name: dept.name,
      code: dept.code,
      count: countByDeptId.get(dept._id.toString()) ?? 0,
    })),
  };
}
/**
 * Service Quản lý Tài liệu Ôn tập (Study Document Service).
 * Xử lý lưu trữ, truy vấn tài liệu theo phạm vi (Chung / Riêng phòng ban) và kiểm soát quyền truy cập file.
 */

import fs from 'fs';
import { StudyDocument, Employee, Topic } from '../models/index.js';
import { DOCUMENT_SCOPE } from '../models/constants.js';
import { ApiError, assertFound } from '../utils/api-error.js';

// Lấy ID phòng ban của thí sinh qua hồ sơ Employee
async function getCandidateDepartmentId(userId) {
  const emp = await Employee.findOne({ userId }).select('departmentId').lean();
  return emp?.departmentId ?? null;
}

// Lấy danh sách tài liệu dành cho cán bộ quản lý (Admin / Examiner / Leader)
export async function listDocumentsForStaff({ topicId } = {}) {
  const query = { isActive: true };
  if (topicId) query.topicId = topicId;
  return StudyDocument.find(query)
    .populate('topicId', 'name')
    .populate('departmentId', 'name')
    .populate('uploadedBy', 'username')
    .sort({ createdAt: -1 })
    .lean();
}

// Lấy danh sách tài liệu dành cho Thí sinh (Lọc tài liệu chung + tài liệu riêng đúng phòng ban của mình)
export async function listDocumentsForCandidate(userId, { topicId } = {}) {
  const departmentId = await getCandidateDepartmentId(userId);
  const scopeQuery = departmentId
    ? {
        $or: [
          { scope: DOCUMENT_SCOPE.COMMON },
          { scope: DOCUMENT_SCOPE.DEPARTMENT_SPECIFIC, departmentId },
        ],
      }
    : { scope: DOCUMENT_SCOPE.COMMON };

  const query = { isActive: true, ...scopeQuery };
  if (topicId) query.topicId = topicId;

  return StudyDocument.find(query)
    .populate('topicId', 'name')
    .sort({ createdAt: -1 })
    .lean();
}

// Tạo mới tài liệu học tập và lưu thông tin file
export async function createDocument({ topicId, title, scope, departmentId, file }, uploadedBy) {
  if (!topicId) {
    throw new ApiError(400, 'Vui lòng chọn chủ đề', 'DOCUMENT_TOPIC_REQUIRED');
  }
  const topic = await Topic.findById(topicId);
  assertFound(topic, 'Không tìm thấy chủ đề', 'TOPIC_NOT_FOUND');

  const resolvedScope =
    scope === DOCUMENT_SCOPE.DEPARTMENT_SPECIFIC
      ? DOCUMENT_SCOPE.DEPARTMENT_SPECIFIC
      : DOCUMENT_SCOPE.COMMON;

  if (resolvedScope === DOCUMENT_SCOPE.DEPARTMENT_SPECIFIC && !departmentId) {
    throw new ApiError(400, 'Vui lòng chọn phòng ban cho tài liệu riêng', 'DOCUMENT_DEPARTMENT_REQUIRED');
  }

  const doc = await StudyDocument.create({
    topicId,
    title: title?.trim() || file.originalname,
    filePath: file.path,
    originalFileName: file.originalname,
    mimeType: file.mimetype,
    scope: resolvedScope,
    departmentId: resolvedScope === DOCUMENT_SCOPE.DEPARTMENT_SPECIFIC ? departmentId : undefined,
    uploadedBy,
  });
  return doc.toObject();
}

// Vô hiệu hóa (xóa mềm) tài liệu (chỉ cho phép chính người đăng hoặc Admin)
export async function deactivateDocument(id, requester) {
  const doc = await StudyDocument.findById(id);
  assertFound(doc, 'Không tìm thấy tài liệu', 'DOCUMENT_NOT_FOUND');

  const isOwner = doc.uploadedBy?.toString() === requester.userId;
  const isAdmin = requester.roleCode === 'admin';
  if (!isOwner && !isAdmin) {
    throw new ApiError(403, 'Bạn không có quyền xóa tài liệu này', 'DOCUMENT_FORBIDDEN');
  }

  doc.isActive = false;
  await doc.save();
  return { id: doc._id.toString(), isActive: false };
}

// Kiểm tra tính hợp lệ và quyền hạn truy cập tài liệu trước khi stream file
export async function getDocumentForAccess(id, requester) {
  const doc = await StudyDocument.findById(id).lean();
  assertFound(doc, 'Không tìm thấy tài liệu', 'DOCUMENT_NOT_FOUND');

  if (!doc.isActive) {
    throw new ApiError(404, 'Tài liệu không còn tồn tại', 'DOCUMENT_NOT_FOUND');
  }

  if (requester.roleCode === 'candidate' && doc.scope === DOCUMENT_SCOPE.DEPARTMENT_SPECIFIC) {
    const departmentId = await getCandidateDepartmentId(requester.userId);
    if (!departmentId || departmentId.toString() !== doc.departmentId?.toString()) {
      throw new ApiError(403, 'Bạn không có quyền truy cập tài liệu này', 'DOCUMENT_FORBIDDEN');
    }
  }

  if (!fs.existsSync(doc.filePath)) {
    throw new ApiError(404, 'File không còn tồn tại trên máy chủ', 'DOCUMENT_FILE_MISSING');
  }

  return doc;
}
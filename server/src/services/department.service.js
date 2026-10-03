/**
 * Service Quản lý Đơn vị / Phòng ban (Department Service).
 * Hỗ trợ chuẩn hóa tên/mã phòng ban (slug), xử lý tìm kiếm không phân biệt hoa thường/dấu và tự động khôi phục dữ liệu import.
 */

import { Department } from '../models/index.js';
import { normalizeDeptName, normalizeDeptCode } from '../models/department.model.js';
import { ApiError, assertFound } from '../utils/api-error.js';
import { planImportDepartments } from '../utils/import-departments.js';

// Lấy danh sách các đơn vị/phòng ban
export async function listDepartments({ activeOnly = true } = {}) {
  const filter = activeOnly ? { isActive: true } : {};
  return Department.find(filter).sort({ name: 1 }).lean();
}

// Tạo mới phòng ban thủ công
export async function createDepartment({ name, code, description }) {
  const trimmed = name?.trim();
  if (!trimmed) {
    throw new ApiError(400, 'Tên bộ phận là bắt buộc', 'DEPARTMENT_VALIDATION');
  }
  const trimmedCode = code ? normalizeDeptCode(code) : '';
  if (!trimmedCode) {
    throw new ApiError(400, 'Mã bộ phận là bắt buộc', 'DEPARTMENT_VALIDATION');
  }
  try {
    const doc = await Department.create({
      name: trimmed,
      code: trimmedCode,
      description: description?.trim() || '',
    });
    return doc.toObject();
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'Tên hoặc mã bộ phận đã tồn tại', 'DEPARTMENT_DUPLICATE');
    }
    throw err;
  }
}

// Khối xử lý Upsert phòng ban khi Import Excel (tự động khôi phục nếu tên/mã trùng với bản ghi đã xóa mềm)
export async function upsertDepartmentForImport({ name, code, description }) {
  const trimmedName = name?.trim();
  if (!trimmedName) {
    throw new ApiError(400, 'Tên bộ phận là bắt buộc', 'DEPARTMENT_VALIDATION');
  }
  const normalizedCode = code ? normalizeDeptCode(code) : undefined;
  const slug = normalizeDeptName(trimmedName);

  let dept = await Department.findOne({ slug });
  if (!dept) {
    const candidates = await Department.find({ slug: { $exists: false } });
    dept = candidates.find((d) => normalizeDeptName(d.name) === slug) || null;
  }
  if (!dept && normalizedCode) {
    dept = await Department.findOne({ code: normalizedCode });
  }

  if (!dept) {
    return createDepartment({ name: trimmedName, code, description });
  }

  if (dept.isActive) {
    return dept.toObject();
  }

  dept.isActive = true;
  dept.name = trimmedName;
  if (normalizedCode) dept.code = normalizedCode;
  if (description !== undefined) dept.description = description?.trim() || '';
  try {
    await dept.save();
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(
        409,
        `Mã bộ phận "${code}" đang được dùng cho bộ phận khác, vui lòng chọn mã khác.`,
        'DEPARTMENT_CODE_DUPLICATE',
      );
    }
    throw err;
  }
  return dept.toObject();
}

// Tìm phòng ban theo tên chuẩn hóa (không phân biệt hoa/thường, không dấu)
export async function findDepartmentByName(name) {
  const slug = normalizeDeptName(name);
  if (!slug) return null;

  let dept = await Department.findOne({ slug, isActive: true });
  if (dept) return dept;

  const legacyCandidates = await Department.find({
    isActive: true,
    slug: { $exists: false },
  });
  dept = legacyCandidates.find((d) => normalizeDeptName(d.name) === slug) || null;
  if (dept) {
    dept.slug = slug;
    await dept.save().catch(() => {
      /* backfill best-effort */
    });
  }
  return dept;
}

// Tìm hoặc tự động tạo phòng ban mới theo tên
export async function findOrCreateDepartmentByName(name) {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const existing = await findDepartmentByName(trimmed);
  if (existing) return existing;

  const slug = normalizeDeptName(trimmed);
  const inactiveMatch = await Department.findOne({ slug, isActive: false });
  if (inactiveMatch) {
    inactiveMatch.isActive = true;
    inactiveMatch.name = trimmed;
    await inactiveMatch.save();
    return inactiveMatch;
  }

  try {
    const doc = await Department.create({ name: trimmed });
    return doc;
  } catch (err) {
    if (err.code === 11000) {
      const dept = await findDepartmentByName(trimmed);
      if (dept) return dept;
    }
    throw err;
  }
}

// Tìm phòng ban theo mã định danh chuẩn hóa
export async function findDepartmentByCode(code) {
  const normalizedCode = normalizeDeptCode(code);
  if (!normalizedCode) return null;
  return Department.findOne({ code: normalizedCode, isActive: true });
}

// Tìm hoặc tự tạo phòng ban theo mã và tên khi Import Excel
export async function findOrCreateDepartmentByCode({ code, name }) {
  const normalizedCode = normalizeDeptCode(code);
  if (!normalizedCode) return null;

  const existingByCode = await findDepartmentByCode(normalizedCode);
  if (existingByCode) return existingByCode;

  const trimmedName = name?.trim();
  if (trimmedName) {
    const byName = await findDepartmentByName(trimmedName);
    if (byName) {
      if (!byName.code) {
        byName.code = normalizedCode;
        await byName.save().catch(() => {
          /* best-effort assignment */
        });
      }
      return byName;
    }
  }

  const inactiveMatch =
    (await Department.findOne({ code: normalizedCode, isActive: false })) ||
    (trimmedName
      ? await Department.findOne({ slug: normalizeDeptName(trimmedName), isActive: false })
      : null);
  if (inactiveMatch) {
    inactiveMatch.isActive = true;
    inactiveMatch.code = normalizedCode;
    if (trimmedName) inactiveMatch.name = trimmedName;
    try {
      await inactiveMatch.save();
      return inactiveMatch;
    } catch {
      /* fallback on race condition */
    }
  }

  try {
    const doc = await Department.create({
      name: trimmedName || normalizedCode,
      code: normalizedCode,
    });
    return doc;
  } catch (err) {
    if (err.code === 11000) {
      const dept = await findDepartmentByCode(normalizedCode);
      if (dept) return dept;
    }
    throw err;
  }
}

// Cập nhật thông tin phòng ban
export async function updateDepartment(id, { name, code, description, isActive } = {}) {
  const dept = await Department.findById(id);
  assertFound(dept, 'Không tìm thấy bộ phận', 'DEPARTMENT_NOT_FOUND');

  if (name !== undefined) {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw new ApiError(400, 'Tên bộ phận là bắt buộc', 'DEPARTMENT_VALIDATION');
    }
    dept.name = trimmed;
  }
  if (code !== undefined) {
    const trimmedCode = code ? normalizeDeptCode(code) : '';
    if (!trimmedCode) {
      throw new ApiError(400, 'Mã bộ phận là bắt buộc', 'DEPARTMENT_VALIDATION');
    }
    dept.code = trimmedCode;
  }
  if (description !== undefined) dept.description = description?.trim() || '';
  if (isActive !== undefined) dept.isActive = Boolean(isActive);

  try {
    await dept.save();
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'Tên hoặc mã bộ phận đã tồn tại', 'DEPARTMENT_DUPLICATE');
    }
    throw err;
  }
  return dept.toObject();
}

// Ngừng sử dụng (xóa mềm) phòng ban để bảo toàn liên kết khóa ngoại
export async function deactivateDepartment(id) {
  const dept = await Department.findById(id);
  assertFound(dept, 'Không tìm thấy bộ phận', 'DEPARTMENT_NOT_FOUND');
  dept.isActive = false;
  await dept.save();
  return { id: dept._id.toString(), isActive: false };
}

// Lấy thông tin chi tiết phòng ban theo ID
export async function getDepartmentById(id) {
  const dept = await Department.findById(id);
  assertFound(dept, 'Không tìm thấy bộ phận', 'DEPARTMENT_NOT_FOUND');
  return dept;
}

// Khối xử lý XÁC NHẬN Import nhân viên: tạo / khôi phục / gán mã cho các phòng ban (chính + kiêm nhiệm).
// items: [{ key, name }]; providedCodes: { [key]: mã admin nhập ở bước preview }.
// Kiểm tra TOÀN BỘ trước (mọi phòng đều phải có mã, mã không trùng) rồi mới ghi, để lỗi mã không làm import dở dang.
// Trả về Map key -> _id phòng ban.
export async function ensureDepartmentsForImport(items, providedCodes = {}) {
  const snapshot = await Department.find().lean();
  const plan = planImportDepartments(items, snapshot, providedCodes);
  if (!plan.ok) {
    throw new ApiError(400, plan.errors.join(' | '), 'IMPORT_DEPARTMENT_INVALID');
  }

  const idByKey = new Map();
  for (const step of plan.steps) {
    try {
      if (step.op === 'create') {
        const doc = await Department.create({ name: step.name, code: step.code });
        idByKey.set(step.key, doc._id);
        continue;
      }
      const doc = await Department.findById(step.deptId);
      assertFound(doc, `Không tìm thấy phòng ban "${step.name}"`, 'DEPARTMENT_NOT_FOUND');
      if (step.reactivate) doc.isActive = true;
      if (step.setCode) doc.code = step.code;
      if (step.reactivate || step.setCode) await doc.save();
      idByKey.set(step.key, doc._id);
    } catch (err) {
      if (err.code === 11000) {
        throw new ApiError(409, `Phòng ban "${step.name}" hoặc mã "${step.code}" đã tồn tại`, 'DEPARTMENT_DUPLICATE');
      }
      throw err;
    }
  }
  return idByKey;
}
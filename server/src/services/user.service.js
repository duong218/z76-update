/**
 * Service Quản lý Người dùng & Nhân sự (User Service).
 * Xử lý: CRUD tài khoản, Phân quyền Role, Khóa/Mở khóa (kèm mốc purge 6 tháng), Reset mật khẩu, Tái sử dụng tài khoản đã khóa, Xuất thông tin đăng nhập và Import Excel nhân viên 2 bước.
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { User, Role, Employee } from '../models/index.js';
import { ApiError } from '../utils/api-error.js';
import * as auditService from './audit.service.js';
import { assignEmployeeToActiveExamIfAny } from './exam-code-generation.service.js';
import { findOrCreateDepartmentByName, findOrCreateDepartmentByCode } from './department.service.js';

// Lấy danh sách toàn bộ người dùng kèm thông tin vai trò (Role) và hồ sơ nhân sự (Employee)
export async function listUsers() {
  const users = await User.find().populate('roleId', 'code name').sort({ createdAt: -1 }).lean();

  const employees = await Employee.find({ userId: { $in: users.map((u) => u._id) } })
    .populate('departmentId', 'name code')
    .lean();
  const employeeByUserId = new Map(employees.map((e) => [e.userId.toString(), e]));

  return users.map((u) => {
    const emp = employeeByUserId.get(u._id.toString());
    return {
      ...u,
      fullname: emp?.fullname ?? '',
      employeeCode: emp?.employeeCode ?? '',
      departmentId: emp?.departmentId?._id ?? emp?.departmentId ?? '',
      departmentName: emp?.departmentId?.name ?? '',
      dob: emp?.dob ?? '',
      gender: emp?.gender ?? '',
      phone: emp?.phone ?? '',
      address: emp?.address ?? '',
      position: emp?.position ?? '',
    };
  });
}

// Sinh ngẫu nhiên mật khẩu tạm 6 chữ số và mã hóa bcrypt hash
async function generateTempPassword() {
  const tempPassword = crypto.randomInt(100000, 999999).toString();
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  return { tempPassword, passwordHash };
}

// Tìm kiếm tài khoản đã tồn tại theo Mã nhân viên hoặc Tên đăng nhập để kiểm tra điều kiện tái sử dụng
async function findExistingAccountForReuse({ employeeCode, username }) {
  if (employeeCode) {
    const employee = await Employee.findOne({ employeeCode });
    if (employee) {
      const user = await User.findById(employee.userId).select('+passwordHash');
      if (user) return { existingUser: user, existingEmployee: employee };
    }
  }

  if (username) {
    const user = await User.findOne({ username: username.toLowerCase() }).select('+passwordHash');
    if (user) {
      const employee = await Employee.findOne({ userId: user._id });
      return { existingUser: user, existingEmployee: employee ?? null };
    }
  }

  return { existingUser: null, existingEmployee: null };
}

// Tái kích hoạt tài khoản đã bị khóa (nhân viên cũ đã nghỉ) để cấp lại cho nhân viên mới cùng mã
async function reactivateLockedAccount({
  adminId,
  existingUser,
  existingEmployee,
  newUsername,
  employeeData,
  ipAddress,
}) {
  if (newUsername && newUsername !== existingUser.username) {
    const usernameTaken = await User.findOne({
      username: newUsername,
      _id: { $ne: existingUser._id },
    });
    if (usernameTaken) {
      throw new ApiError(
        400,
        `Username "${newUsername}" đã được tài khoản khác sử dụng`,
        'USERNAME_EXISTS',
      );
    }
    existingUser.username = newUsername;
  }

  const { tempPassword, passwordHash } = await generateTempPassword();
  existingUser.passwordHash = passwordHash;
  existingUser.mustChangePassword = true;
  existingUser.isActive = true;
  existingUser.failedLoginAttempts = 0;
  existingUser.lockUntil = undefined;
  existingUser.lockedAt = undefined;
  existingUser.tokenVersion += 1;
  await existingUser.save();

  let employee = existingEmployee;
  if (employee) {
    employee.fullname = employeeData.fullname;
    employee.departmentId = employeeData.departmentId;
    employee.employeeCode = employeeData.employeeCode || employee.employeeCode;
    employee.dob = employeeData.dob ?? '';
    employee.gender = employeeData.gender ?? '';
    employee.phone = employeeData.phone ?? '';
    employee.address = employeeData.address ?? '';
    employee.position = employeeData.position ?? '';
    employee.isActive = true;
    await employee.save();
  } else {
    employee = await Employee.create({
      fullname: employeeData.fullname,
      departmentId: employeeData.departmentId,
      userId: existingUser._id,
      employeeCode: employeeData.employeeCode || undefined,
      dob: employeeData.dob ?? '',
      gender: employeeData.gender ?? '',
      phone: employeeData.phone ?? '',
      address: employeeData.address ?? '',
      position: employeeData.position ?? '',
      isActive: true,
    });
  }

  await auditService.writeAudit({
    actorUserId: adminId,
    action: 'Tái sử dụng tài khoản đã khóa',
    resourceType: 'User',
    resourceId: existingUser._id,
    metadata: {
      username: existingUser.username,
      employeeCode: employee.employeeCode,
      detail: 'Tài khoản của nhân viên đã nghỉ (bị khóa) được cấp lại cho nhân viên mới cùng mã',
    },
    ipAddress,
  });

  const userObj = existingUser.toObject();
  delete userObj.passwordHash;
  return { user: userObj, tempPassword, employee };
}

// Tạo tài khoản người dùng mới (tự động tạo kèm hồ sơ Employee nếu là Thí sinh)
export async function createUser({ adminId, username, roleId, ipAddress, employeeInfo }) {
  const role = await Role.findById(roleId);
  if (!role) {
    throw new ApiError(400, 'Vai trò không hợp lệ', 'ROLE_NOT_FOUND');
  }

  const isCandidate = role.code === 'candidate';
  if (isCandidate) {
    if (!employeeInfo?.fullname || !employeeInfo?.departmentId) {
      throw new ApiError(
        400,
        'Tài khoản thí sinh bắt buộc phải có họ tên và phòng ban',
        'MISSING_EMPLOYEE_FIELDS',
      );
    }
  }

  // Kiểm tra trùng lặp và kích hoạt lại tài khoản cũ nếu đang bị khóa
  {
    const { existingUser, existingEmployee } = await findExistingAccountForReuse({
      employeeCode: isCandidate ? employeeInfo?.employeeCode : undefined,
      username,
    });

    if (existingUser) {
      if (existingUser.isActive) {
        const conflictField = existingEmployee?.employeeCode ? 'Mã nhân viên' : 'Tên đăng nhập';
        throw new ApiError(
          409,
          `${conflictField} đã tồn tại và tài khoản đang hoạt động`,
          existingEmployee?.employeeCode ? 'EMPLOYEE_CODE_ACTIVE' : 'USERNAME_EXISTS',
        );
      }

      if (!isCandidate) {
        throw new ApiError(400, 'Tên đăng nhập đã tồn tại', 'USERNAME_EXISTS');
      }

      const { user, tempPassword, employee } = await reactivateLockedAccount({
        adminId,
        existingUser,
        existingEmployee,
        newUsername: username?.toLowerCase(),
        employeeData: employeeInfo,
        ipAddress,
      });
      await assignEmployeeToActiveExamIfAny(employee).catch(() => {});
      return { user, tempPassword, employee, reused: true };
    }
  }

  const { tempPassword, passwordHash } = await generateTempPassword();

  const newUser = await User.create({
    username: username.toLowerCase(),
    roleId,
    passwordHash,
    mustChangePassword: true,
  });

  let employee = null;
  if (isCandidate) {
    try {
      employee = await Employee.create({
        fullname: employeeInfo.fullname,
        departmentId: employeeInfo.departmentId,
        userId: newUser._id,
        employeeCode: employeeInfo.employeeCode || undefined,
        isActive: true,
      });
    } catch (err) {
      await User.deleteOne({ _id: newUser._id });
      throw new ApiError(
        400,
        `Không thể tạo hồ sơ nhân viên: ${err.message}`,
        'EMPLOYEE_CREATE_FAILED',
      );
    }

    await assignEmployeeToActiveExamIfAny(employee);
  }

  const userObj = newUser.toObject();
  delete userObj.passwordHash;
  return { user: userObj, tempPassword, employee, reused: false };
}


// Cập nhật vai trò (Role) cho người dùng
export async function updateUserRole({ adminId, userId, newRoleId, ipAddress }) {
  if (adminId.toString() === userId.toString()) {
    throw new ApiError(403, 'Không thể tự đổi quyền của chính mình', 'CANNOT_CHANGE_OWN_ROLE');
  }

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'Không tìm thấy người dùng', 'USER_NOT_FOUND');

  const oldRoleId = user.roleId;
  user.roleId = newRoleId;
  await user.save();

  return user;
}

// Khóa hoặc Mở khóa tài khoản (lưu mốc lockedAt và tăng tokenVersion để thu hồi phiên đăng nhập)
export async function toggleUserLock({ adminId, userId, isActive, ipAddress }) {
  if (adminId.toString() === userId.toString()) {
    throw new ApiError(403, 'Không thể tự khóa/mở khóa tài khoản của chính mình', 'CANNOT_LOCK_SELF');
  }

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'Không tìm thấy người dùng', 'USER_NOT_FOUND');

  user.isActive = isActive;
  user.lockedAt = isActive ? undefined : new Date();
  user.tokenVersion += 1;
  await user.save();

  return user;
}

// Reset mật khẩu người dùng về mật khẩu tạm ngẫu nhiên 6 chữ số
export async function resetUserPassword({ adminId, userId, ipAddress }) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'Không tìm thấy người dùng', 'USER_NOT_FOUND');

  const { tempPassword, passwordHash } = await generateTempPassword();

  user.passwordHash = passwordHash;
  user.mustChangePassword = true;
  user.tokenVersion += 1;
  await user.save();

  return { tempPassword };
}

// Xuất file Excel danh sách thông tin đăng nhập của toàn bộ Thí sinh (kèm reset mật khẩu tạm mới)
export async function exportCandidateCredentialsExcel({ adminId, ipAddress }) {
  const candidateRole = await Role.findOne({ code: 'candidate' });
  if (!candidateRole) {
    throw new ApiError(500, 'Không tìm thấy role "candidate" trong hệ thống', 'ROLE_NOT_FOUND');
  }

  const users = await User.find({ roleId: candidateRole._id, isActive: true }).sort({ username: 1 });
  if (!users.length) {
    throw new ApiError(404, 'Không có tài khoản nhân viên nào đang hoạt động để xuất', 'NO_CANDIDATE_USERS');
  }

  const employees = await Employee.find({ userId: { $in: users.map((u) => u._id) } })
    .populate('departmentId', 'name')
    .lean();
  const employeeByUserId = new Map(employees.map((e) => [e.userId.toString(), e]));

  const rows = [];
  for (const user of users) {
    const { tempPassword, passwordHash } = await generateTempPassword();
    user.passwordHash = passwordHash;
    user.mustChangePassword = true;
    user.tokenVersion += 1;
    await user.save();

    const emp = employeeByUserId.get(user._id.toString());
    rows.push({
      fullname: emp?.fullname ?? '',
      employeeCode: emp?.employeeCode ?? '',
      departmentName: emp?.departmentId?.name ?? '',
      position: emp?.position ?? '',
      username: user.username,
      tempPassword,
    });
  }

  const buffer = await buildCredentialsWorkbook(rows);

  await auditService.writeAudit({
    actorUserId: adminId,
    action: 'EXPORT_CANDIDATE_CREDENTIALS',
    resourceType: 'User',
    resourceId: null,
    metadata: { detail: `Xuất danh sách + reset mật khẩu tạm cho ${rows.length} tài khoản nhân viên` },
    ipAddress,
  });

  return { buffer, count: rows.length };
}

// Dựng bảng tính Excel danh sách tài khoản thí sinh với màu sắc và viền định dạng đẹp mắt
async function buildCredentialsWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Z176 - Hệ thống thi nội bộ';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Danh sách nhân viên', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'STT', key: 'stt', width: 6 },
    { header: 'Họ tên', key: 'fullname', width: 26 },
    { header: 'Mã nhân viên', key: 'employeeCode', width: 16 },
    { header: 'Phòng ban', key: 'departmentName', width: 24 },
    { header: 'Chức vụ', key: 'position', width: 20 },
    { header: 'Username', key: 'username', width: 18 },
    { header: 'Mật khẩu tạm', key: 'tempPassword', width: 16 },
  ];

  rows.forEach((r, i) => sheet.addRow({ stt: i + 1, ...r }));

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF008BC5' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    };
  });
  headerRow.height = 22;

  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const isEven = i % 2 === 0;
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
      cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'center' : 'left' };
      if (isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9FC' } };
      }
      const isPasswordCol = sheet.getColumn(colNumber).key === 'tempPassword';
      const isUsernameCol = sheet.getColumn(colNumber).key === 'username';
      if (isPasswordCol) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      if (isUsernameCol) {
        cell.font = { bold: true };
      }
    });
    row.height = 18;
  }

  sheet.autoFilter = { from: 'A1', to: `G1` };

  const noteRowIndex = sheet.rowCount + 2;
  const note = sheet.getCell(`A${noteRowIndex}`);
  note.value = 'Lưu ý: Mật khẩu tạm chỉ hiển thị được 1 lần duy nhất tại thời điểm xuất. Vui lòng gửi cho nhân viên và yêu cầu đổi mật khẩu ngay lần đăng nhập đầu tiên. Không chia sẻ file này cho người không liên quan.';
  note.font = { italic: true, size: 10, color: { argb: 'FFB91C1C' } };
  sheet.mergeCells(`A${noteRowIndex}:G${noteRowIndex}`);
  sheet.getRow(noteRowIndex).alignment = { wrapText: true };

  return workbook.xlsx.writeBuffer();
}

// ============ Import Excel Danh Sách Nhân Viên (Bulk Import) ============

function normalizeKey(key) {
  return String(key ?? '')
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '');
}

function mapRowKeys(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[normalizeKey(k)] = v;
  }
  return out;
}

// Chuẩn hóa mã nhân viên thành username viết liền không dấu (VD: "NV-001" -> "nv001")
function usernameFromEmployeeCode(code) {
  return String(code)
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}

// Đọc và parse dữ liệu 1 dòng nhân viên từ Excel (tự động tìm/tạo phòng ban theo mã hoặc tên)
async function buildEmployeeImportRow(row, rowIndex) {
  const r = mapRowKeys(row);
  const fullname = r.fullname ?? r.hoten ?? r.hovaten;
  const deptCodeRaw = r.maphongban ?? r.mabophan ?? r.maban ?? r.madepartment;
  const deptName = r.department ?? r.phongban ?? r.bophan;
  const employeeCodeRaw = r.employeecode ?? r.manhanvien ?? r.manv ?? r.ma ?? r.masonhanvien;
  const dob = r.ngaysinh ?? r.dob ?? '';
  const gender = r.gioitinh ?? r.gender ?? '';
  const phone = r.sodienthoai ?? r.dienthoai ?? r.sdt ?? r.phone ?? '';
  const address = r.diachi ?? r.address ?? '';
  const position = r.chucvu ?? r.position ?? '';

  if (!String(fullname ?? '').trim()) {
    throw new ApiError(400, `Dòng ${rowIndex}: thiếu họ tên`, 'IMPORT_ROW_INVALID');
  }
  if (!String(deptCodeRaw ?? '').trim() && !String(deptName ?? '').trim()) {
    throw new ApiError(
      400,
      `Dòng ${rowIndex}: thiếu phòng ban (cần Mã phòng ban hoặc Phòng ban)`,
      'IMPORT_ROW_INVALID',
    );
  }

  const employeeCode = String(employeeCodeRaw ?? '').trim() || `TMP${rowIndex}`;
  const username = usernameFromEmployeeCode(employeeCode);
  if (!username) {
    throw new ApiError(
      400,
      `Dòng ${rowIndex}: mã nhân viên "${employeeCode}" không sinh được username hợp lệ`,
      'IMPORT_ROW_INVALID',
    );
  }

  const dept = String(deptCodeRaw ?? '').trim()
    ? await findOrCreateDepartmentByCode({ code: deptCodeRaw, name: deptName })
    : await findOrCreateDepartmentByName(String(deptName));
  if (!dept) {
    throw new ApiError(400, `Dòng ${rowIndex}: phòng ban không hợp lệ`, 'IMPORT_ROW_INVALID');
  }

  return {
    rowIndex,
    fullname: String(fullname).trim(),
    employeeCode,
    username,
    departmentId: dept._id,
    departmentName: dept.name,
    dob: String(dob ?? '').trim(),
    gender: String(gender ?? '').trim(),
    phone: String(phone ?? '').trim(),
    address: String(address ?? '').trim(),
    position: String(position ?? '').trim(),
  };
}

// Đọc toàn bộ các dòng dữ liệu nhân viên từ file Excel
function readImportRows(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new ApiError(400, 'Không đọc được file upload', 'IMPORT_FILE_MISSING');
  }

  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ApiError(400, 'File Excel không có sheet', 'IMPORT_EMPTY');

  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (!rawRows.length) throw new ApiError(400, 'Sheet trống', 'IMPORT_EMPTY');

  const rows = [];
  for (let i = 0; i < rawRows.length; i += 1) {
    const rowIndex = i + 2;
    const nonEmptyCellCount = Object.values(rawRows[i]).filter(
      (v) => String(v ?? '').trim() !== '',
    ).length;
    if (nonEmptyCellCount <= 1) continue;

    rows.push({ rowIndex, raw: rawRows[i] });
  }
  return rows;
}

// Phân loại hành vi xử lý của từng dòng nhân viên (create / reuse / update / conflict)
async function classifyImportRow(parsed) {
  const { existingUser, existingEmployee } = await findExistingAccountForReuse({
    employeeCode: parsed.employeeCode,
    username: parsed.username,
  });

  if (!existingUser) {
    return { ...parsed, action: 'create' };
  }

  if (!existingUser.isActive) {
    return {
      ...parsed,
      action: 'reuse',
      reuseTarget: {
        userId: existingUser._id.toString(),
        username: existingUser.username,
        fullname: existingEmployee?.fullname ?? '(không có hồ sơ)',
        employeeCode: existingEmployee?.employeeCode ?? '',
      },
    };
  }

  const sameEmployeeCode =
    parsed.employeeCode && existingEmployee?.employeeCode === parsed.employeeCode;
  if (sameEmployeeCode || existingUser.username === parsed.username) {
    return {
      ...parsed,
      action: 'update',
      updateTarget: {
        userId: existingUser._id.toString(),
        username: existingUser.username,
        fullname: existingEmployee?.fullname ?? '',
      },
    };
  }

  return {
    ...parsed,
    action: 'conflict',
    conflictWith: {
      username: existingUser.username,
      fullname: existingEmployee?.fullname ?? '',
      employeeCode: existingEmployee?.employeeCode ?? '',
    },
  };
}

// Bước 1: Xem trước (Preview) kết quả Import Nhân sự (Phát hiện trùng lặp trong file và đối chiếu với CSDL)
export async function previewEmployeesFromExcelFile(filePath) {
  const rows = readImportRows(filePath);

  const parsedRows = [];
  const parseErrors = [];
  for (const { rowIndex, raw } of rows) {
    try {
      const parsed = await buildEmployeeImportRow(raw, rowIndex);
      parsedRows.push(parsed);
    } catch (err) {
      parseErrors.push({
        rowIndex,
        action: 'error',
        message: err.message ?? 'Lỗi không xác định',
      });
    }
  }

  const rowIndexesByCode = new Map();
  for (const p of parsedRows) {
    const list = rowIndexesByCode.get(p.employeeCode) ?? [];
    list.push(p.rowIndex);
    rowIndexesByCode.set(p.employeeCode, list);
  }

  const preview = [];
  let toCreate = 0;
  let toReuse = 0;
  let toUpdate = 0;
  let conflicts = 0;
  let duplicatesInFile = 0;
  let errors = parseErrors.length;

  for (const parsed of parsedRows) {
    const duplicateRowIndexes = rowIndexesByCode
      .get(parsed.employeeCode)
      .filter((idx) => idx !== parsed.rowIndex);

    if (duplicateRowIndexes.length > 0) {
      duplicatesInFile += 1;
      preview.push({
        ...parsed,
        action: 'duplicate_in_file',
        duplicateRows: duplicateRowIndexes,
        message: `Mã nhân viên "${parsed.employeeCode}" xuất hiện ở nhiều dòng trong cùng file (dòng ${[parsed.rowIndex, ...duplicateRowIndexes].sort((a, b) => a - b).join(', ')}) — hãy sửa file để mỗi mã chỉ còn 1 dòng rồi import lại`,
      });
      continue;
    }

    const classified = await classifyImportRow(parsed);
    preview.push(classified);
    if (classified.action === 'create') toCreate += 1;
    else if (classified.action === 'reuse') toReuse += 1;
    else if (classified.action === 'update') toUpdate += 1;
    else if (classified.action === 'conflict') conflicts += 1;
  }

  const merged = [...preview, ...parseErrors].sort((a, b) => a.rowIndex - b.rowIndex);

  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore cleanup */
  }

  return {
    total: rows.length,
    toCreate,
    toReuse,
    toUpdate,
    conflicts,
    duplicatesInFile,
    errors,
    rows: merged,
  };
}

// Bước 2: Xác nhận (Confirm) Import Nhân sự vào CSDL (Tạo mới, Cập nhật hoặc Tái kích hoạt tài khoản đã khóa)
export async function confirmEmployeeImportRows(rows, adminId, ipAddress) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new ApiError(400, 'Không có dòng nào để xác nhận import', 'IMPORT_EMPTY');
  }

  const candidateRole = await Role.findOne({ code: 'candidate' });
  if (!candidateRole) {
    throw new ApiError(500, 'Chưa cấu hình role candidate trong hệ thống', 'ROLE_NOT_FOUND');
  }

  const results = [];
  let createdCount = 0;
  let updatedCount = 0;
  let reusedCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    const { rowIndex, action } = row ?? {};
    if (action !== 'create' && action !== 'reuse' && action !== 'update') {
      continue;
    }

    try {
      if (action === 'reuse' || action === 'update') {
        const targetUserId = row.reuseTarget?.userId ?? row.updateTarget?.userId;
        const existingUser = await User.findById(targetUserId).select('+passwordHash');
        if (!existingUser) {
          throw new ApiError(
            400,
            `Dòng ${rowIndex}: tài khoản dự kiến ${action === 'reuse' ? 'tái sử dụng' : 'cập nhật'} không còn tồn tại — có thể đã bị xóa giữa lúc xem trước và xác nhận`,
            'IMPORT_TARGET_MISSING',
          );
        }
        const existingEmployee = await Employee.findOne({ userId: existingUser._id });

        if (action === 'reuse') {
          if (existingUser.isActive) {
            throw new ApiError(
              409,
              `Dòng ${rowIndex}: tài khoản "${existingUser.username}" đã được mở khóa bởi thao tác khác — không thể tự động tái sử dụng nữa`,
              'IMPORT_TARGET_NO_LONGER_LOCKED',
            );
          }
          const { user, tempPassword } = await reactivateLockedAccount({
            adminId,
            existingUser,
            existingEmployee,
            newUsername: row.username,
            employeeData: row,
            ipAddress,
          });
          results.push({
            row: rowIndex,
            employeeCode: row.employeeCode,
            username: user.username,
            fullname: row.fullname,
            department: row.departmentName,
            status: 'reused',
            tempPassword,
            message: `Đã mở khóa và cấp lại tài khoản (trước đó thuộc về "${row.reuseTarget?.fullname || row.reuseTarget?.username}")`,
          });
          reusedCount += 1;
          continue;
        }

        if (existingEmployee) {
          existingEmployee.fullname = row.fullname;
          existingEmployee.departmentId = row.departmentId;
          existingEmployee.employeeCode = row.employeeCode || existingEmployee.employeeCode;
          existingEmployee.dob = row.dob;
          existingEmployee.gender = row.gender;
          existingEmployee.phone = row.phone;
          existingEmployee.address = row.address;
          existingEmployee.position = row.position;
          await existingEmployee.save();
        } else {
          await Employee.create({
            fullname: row.fullname,
            departmentId: row.departmentId,
            userId: existingUser._id,
            employeeCode: row.employeeCode,
            dob: row.dob,
            gender: row.gender,
            phone: row.phone,
            address: row.address,
            position: row.position,
            isActive: true,
          });
        }
        results.push({
          row: rowIndex,
          employeeCode: row.employeeCode,
          username: existingUser.username,
          fullname: row.fullname,
          department: row.departmentName,
          status: 'updated',
          tempPassword: '',
          message: 'Đã cập nhật hồ sơ (không tạo tài khoản mới)',
        });
        updatedCount += 1;
        continue;
      }

      const usernameTaken = await User.findOne({ username: row.username });
      if (usernameTaken) {
        throw new ApiError(
          400,
          `Dòng ${rowIndex}: username "${row.username}" đã tồn tại — dữ liệu có thể vừa thay đổi giữa lúc xem trước và xác nhận, hãy import lại`,
          'IMPORT_USERNAME_CONFLICT',
        );
      }

      const { tempPassword, passwordHash } = await generateTempPassword();
      const newUser = await User.create({
        username: row.username,
        roleId: candidateRole._id,
        passwordHash,
        mustChangePassword: true,
      });

      let employee;
      try {
        employee = await Employee.create({
          fullname: row.fullname,
          departmentId: row.departmentId,
          userId: newUser._id,
          employeeCode: row.employeeCode,
          dob: row.dob,
          gender: row.gender,
          phone: row.phone,
          address: row.address,
          position: row.position,
          isActive: true,
        });
      } catch (err) {
        await User.deleteOne({ _id: newUser._id });
        throw new ApiError(
          400,
          `Dòng ${rowIndex}: không thể tạo hồ sơ nhân viên (${err.message})`,
          'EMPLOYEE_CREATE_FAILED',
        );
      }

      await assignEmployeeToActiveExamIfAny(employee).catch(() => {});

      results.push({
        row: rowIndex,
        employeeCode: row.employeeCode,
        username: row.username,
        fullname: row.fullname,
        department: row.departmentName,
        status: 'created',
        tempPassword,
        message: 'Tạo tài khoản thành công',
      });
      createdCount += 1;
    } catch (err) {
      failedCount += 1;
      results.push({
        row: rowIndex,
        employeeCode: row?.employeeCode ?? '',
        username: '',
        fullname: row?.fullname ?? '',
        department: row?.departmentName ?? '',
        status: 'error',
        tempPassword: '',
        message: err.message ?? 'Lỗi không xác định',
      });
    }
  }

  if (createdCount > 0 || updatedCount > 0 || reusedCount > 0) {
    await auditService.writeAudit({
      actorUserId: adminId,
      action: 'Import nhân viên từ Excel',
      resourceType: 'User',
      metadata: { created: createdCount, updated: updatedCount, reused: reusedCount, failed: failedCount },
      ipAddress,
    });
  }

  return {
    total: results.length,
    created: createdCount,
    updated: updatedCount,
    reused: reusedCount,
    failed: failedCount,
    results,
  };
}
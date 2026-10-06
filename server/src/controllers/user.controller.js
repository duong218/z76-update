/**
 * Controller Quản trị Người dùng & Nhân sự (User & Employee Management).
 * Cung cấp các thao tác CRUD người dùng, phân quyền, khóa/mở khóa, reset mật khẩu,
 * xuất danh sách tài khoản thí sinh và quy trình 2 bước Import danh sách nhân viên từ file Excel.
 */

import * as userService from '../services/user.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ApiError } from '../utils/api-error.js';
import { writeAudit } from '../services/audit.service.js';

// Lấy danh sách toàn bộ người dùng trong hệ thống
export const list = asyncHandler(async (req, res) => {
  const data = await userService.listUsers();
  res.json({ success: true, message: 'OK', code: 'USER_LIST_OK', data });
});

// Tạo tài khoản mới hoặc tự động tái sử dụng tài khoản đã khóa nếu trùng mã nhân viên
export const create = asyncHandler(async (req, res) => {
  const { username, roleId, fullname, departmentId, employeeCode, extraDepartmentIds } = req.body ?? {};
  if (!username || !roleId) {
    throw new ApiError(400, 'Thiếu thông tin bắt buộc (username, roleId)', 'MISSING_FIELDS');
  }

  const { user, tempPassword, employee, reused } = await userService.createUser({
    adminId: req.auth.userId,
    username,
    roleId,
    ipAddress: req.ip,
    employeeInfo: { fullname, departmentId, employeeCode, extraDepartmentIds },
  });

  if (!reused) {
    await writeAudit({
      actorUserId: req.auth.userId,
      action: 'CREATE_USER',
      resourceType: 'User',
      resourceId: user._id,
      metadata: { detail: `Tạo tài khoản mới: ${username}` },
      ipAddress: req.ip,
    });
  }

  res.status(201).json({
    success: true,
    message: reused
      ? `Mã nhân viên "${employeeCode}" trùng với tài khoản đã bị khóa — đã tự động mở khóa và cấp lại cho nhân viên mới`
      : 'Tạo tài khoản thành công',
    code: reused ? 'USER_REUSED' : 'USER_CREATED',
    data: { ...user, employee },
    tempPassword, // Chỉ hiển thị mật khẩu khởi tạo 1 lần duy nhất
  });
});

// Cập nhật vai trò / phân quyền cho người dùng
export const updateRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { roleId } = req.body ?? {};
  if (!roleId) {
    throw new ApiError(400, 'Thiếu roleId', 'MISSING_FIELDS');
  }

  const data = await userService.updateUserRole({
    adminId: req.auth.userId,
    userId: id,
    newRoleId: roleId,
    ipAddress: req.ip,
  });

  await writeAudit({
    actorUserId: req.auth.userId,
    action: 'UPDATE_ROLE',
    resourceType: 'User',
    resourceId: id,
    metadata: { detail: `Cập nhật phân quyền cho tài khoản ${data.username}` },
    ipAddress: req.ip,
  });

  res.json({ success: true, message: 'Cập nhật phân quyền thành công', code: 'ROLE_UPDATED', data });
});

// Sửa thông tin cá nhân (hồ sơ nhân sự) của bất kỳ tài khoản nào
export const updateProfile = asyncHandler(async (req, res) => {
  const data = await userService.updateUserProfile({ userId: req.params.id, profile: req.body ?? {} });

  await writeAudit({
    actorUserId: req.auth.userId,
    action: 'UPDATE_USER_PROFILE',
    resourceType: 'User',
    resourceId: req.params.id,
    metadata: { detail: `Cập nhật thông tin cá nhân của tài khoản ${data.username}` },
    ipAddress: req.ip,
  });

  res.json({ success: true, message: 'Cập nhật thông tin cá nhân thành công', code: 'USER_PROFILE_UPDATED', data });
});

// Khóa hoặc Mở khóa tài khoản người dùng
export const toggleLock = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body ?? {};
  if (typeof isActive !== 'boolean') {
    throw new ApiError(400, 'isActive phải là boolean', 'INVALID_FIELD');
  }

  const data = await userService.toggleUserLock({
    adminId: req.auth.userId,
    userId: id,
    isActive,
    ipAddress: req.ip,
  });

  await writeAudit({
    actorUserId: req.auth.userId,
    action: isActive ? 'UNLOCK_USER' : 'LOCK_USER',
    resourceType: 'User',
    resourceId: id,
    metadata: { detail: `${isActive ? 'Mở khóa' : 'Khóa'} tài khoản ${data.username}` },
    ipAddress: req.ip,
  });

  res.json({ success: true, message: isActive ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản', code: 'LOCK_TOGGLED', data });
});

// Sửa phòng ban chính / phòng kiêm nhiệm của 1 nhân viên (chỉ gửi field nào muốn đổi)
export const updateDepartments = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { departmentId, extraDepartmentIds } = req.body ?? {};
  if (departmentId === undefined && extraDepartmentIds === undefined) {
    throw new ApiError(400, 'Thiếu departmentId hoặc extraDepartmentIds', 'MISSING_FIELDS');
  }

  const data = await userService.updateEmployeeDepartments({
    adminId: req.auth.userId,
    userId: id,
    departmentId,
    extraDepartmentIds,
    ipAddress: req.ip,
  });

  const extraNames = data.extraDepartments.map((d) => d.name).join('; ');
  await writeAudit({
    actorUserId: req.auth.userId,
    action: 'UPDATE_EMPLOYEE_DEPARTMENTS',
    resourceType: 'User',
    resourceId: id,
    metadata: {
      detail: `Cập nhật phòng ban của ${data.fullname || id}: chính "${data.departmentName}", kiêm nhiệm: ${extraNames || 'không có'}`,
    },
    ipAddress: req.ip,
  });

  res.json({ success: true, message: 'Cập nhật phòng ban thành công', code: 'EMPLOYEE_DEPARTMENTS_UPDATED', data });
});

// Đặt lại mật khẩu tạm thời cho người dùng (bắt buộc đổi mật khẩu ở lần đăng nhập kế tiếp)
export const resetPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { tempPassword, user } = await userService.resetUserPassword({
    adminId: req.auth.userId,
    userId: id,
    ipAddress: req.ip,
  });

  await writeAudit({
    actorUserId: req.auth.userId,
    action: 'RESET_PASSWORD',
    resourceType: 'User',
    resourceId: id,
    metadata: { detail: `Đặt lại mật khẩu cho tài khoản ${user?.username || id}` },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: 'Đã reset mật khẩu thành công',
    code: 'PASSWORD_RESET',
    tempPassword,
  });
});

// Xuất file Excel chứa tài khoản và mật khẩu tạm của thí sinh
export const exportCandidateCredentials = asyncHandler(async (req, res) => {
  const { buffer } = await userService.exportCandidateCredentialsExcel({
    adminId: req.auth.userId,
    ipAddress: req.ip,
  });

  const filename = `danh-sach-nhan-vien-${new Date().toISOString().slice(0, 10)}.xlsx`;

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  res.send(buffer);
});

// Bước 1 Import Excel: Đọc và phân tích file Excel xem trước các bản ghi (hợp lệ, trùng lặp, lỗi)
export const previewImportExcel = asyncHandler(async (req, res) => {
  if (!req.file?.path) {
    throw new ApiError(400, 'Thiếu file Excel (field: file)', 'IMPORT_FILE_MISSING');
  }

  const data = await userService.previewEmployeesFromExcelFile(req.file.path);

  res.json({
    success: true,
    message: `Xem trước: ${data.toCreate} tạo mới, ${data.toReuse} sẽ tái sử dụng tài khoản đã khóa, ${data.toUpdate} cập nhật, ${data.conflicts} trùng tài khoản đang hoạt động, ${data.duplicatesInFile} trùng mã trong cùng file, ${data.errors} lỗi; ${data.departmentsNeedingCode} phòng ban cần nhập mã, ${data.rowsWithWarnings} dòng có cảnh báo`,
    code: 'EMPLOYEE_IMPORT_PREVIEW_OK',
    data,
  });
});

// Bước 2 Import Excel: Xác nhận thực hiện lưu các bản ghi đã duyệt vào CSDL
export const confirmImportExcel = asyncHandler(async (req, res) => {
  const { rows, departmentCodes } = req.body ?? {};
  if (!Array.isArray(rows) || !rows.length) {
    throw new ApiError(400, 'Thiếu dữ liệu các dòng cần import (rows)', 'MISSING_FIELDS');
  }

  // departmentCodes: { [key phòng ban từ bước preview]: mã phòng ban admin đã nhập }
  const data = await userService.confirmEmployeeImportRows(rows, req.auth.userId, req.ip, { departmentCodes });

  res.json({
    success: true,
    message: `Import xong: ${data.created} tạo mới, ${data.reused} tái sử dụng (mã trùng tài khoản đã khóa), ${data.updated} cập nhật, ${data.failed} lỗi`,
    code: 'EMPLOYEE_IMPORT_DONE',
    data,
  });
});
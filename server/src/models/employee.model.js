import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema(
  {
    fullname: { type: String, required: true, trim: true },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true,
    },
    // Các phòng ban KIÊM NHIỆM (ngoài phòng ban chính `departmentId`). Ở mỗi kỳ thi, thí sinh
    // chọn 1 vai trò trong tập {phòng chính} ∪ {phòng kiêm nhiệm} để thi (xem exam-attempt.service.js).
    extraDepartmentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
      },
    ],
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    // unique + sparse: chặn trùng employeeCode ở tầng DB (ngoài check tay ở
    // user.service.js#importEmployeesFromExcelFile) — sparse để các document
    // không có employeeCode (rỗng/null) không bị tính là trùng nhau.
    employeeCode: { type: String, trim: true, unique: true, sparse: true },
    // Các field "hồ sơ tham khảo" từ file Excel import — không bắt buộc,
    // không dùng cho logic phân quyền/đề thi, chỉ để hiển thị trong bảng
    // quản lý tài khoản. Lưu dạng String thô (giữ đúng format người dùng
    // nhập, vd "12/05/1995") vì không cần tính toán ngày giờ.
    dob: { type: String, trim: true, default: '' },
    gender: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    position: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

employeeSchema.index({ extraDepartmentIds: 1 });

export const Employee = mongoose.model('Employee', employeeSchema);

// Tập ID phòng ban "hiệu lực" của nhân viên = phòng chính + các phòng kiêm nhiệm (không trùng, dạng chuỗi).
// Chấp nhận cả document chưa populate lẫn đã populate.
export function getEmployeeDepartmentIds(employee) {
  const ids = [employee?.departmentId, ...(employee?.extraDepartmentIds ?? [])]
    .filter(Boolean)
    .map((d) => String(d?._id ?? d));
  return [...new Set(ids)];
}
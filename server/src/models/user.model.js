import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    mustChangePassword: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    /**
     * MỚI — Mốc thời gian LẦN KHÓA GẦN NHẤT (chỉ dùng cho việc admin chủ động
     * khóa tài khoản qua toggleUserLock, KHÁC với `lockUntil` — dùng cho khóa
     * tạm do đăng nhập sai nhiều lần). Được set lại mỗi lần isActive chuyển
     * true -> false, và xóa (undefined) khi mở khóa lại — nhờ vậy nếu tài
     * khoản được mở khóa rồi khóa lại, mốc đếm 6 tháng để xóa cứng
     * (account-purge.service.js) tự động tính lại từ đầu.
     */
    lockedAt: { type: Date },
    /** Tăng khi đổi mật khẩu / logout toàn cục — vô hiệu refresh token cũ */
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
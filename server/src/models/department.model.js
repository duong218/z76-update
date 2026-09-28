import mongoose from 'mongoose';

/**
 * Chuẩn hoá tên phòng ban để so khớp: bỏ dấu tiếng Việt, hạ thường, gộp
 * khoảng trắng thừa. Dùng để tránh tạo trùng phòng ban khi dữ liệu import
 * lệch dấu/hoa-thường (vd "cong nghe thong tin" và "công nghệ thông tin"
 * phải được coi là CÙNG một phòng ban).
 */
export function normalizeDeptName(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chuẩn hoá MÃ phòng ban: hoa toàn bộ, bỏ dấu, bỏ khoảng trắng/ký tự thừa —
 * "cntt", " CNTT ", "Cntt" đều quy về "CNTT". Mã phòng ban là khoá chính để
 * import Excel xác định/tạo phòng ban, nên phải chuẩn hoá chặt để không tạo
 * trùng phòng ban chỉ vì lệch hoa/thường khi nhập liệu.
 */
export function normalizeDeptCode(code) {
  return String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Z0-9]/g, '');
}

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    // Tên đã chuẩn hoá (bỏ dấu, lowercase) — dùng để tìm/khớp phòng ban theo
    // TÊN khi import Excel không có cột mã, tránh tạo trùng phòng ban do
    // lệch dấu/hoa-thường. sparse: doc tạo trước khi có field này sẽ được
    // backfill ở lần tìm đầu tiên (xem department.service.js).
    slug: { type: String, unique: true, sparse: true, index: true },
    // Mã phòng ban — khoá chính để import Excel xác định/tạo phòng ban.
    // Luôn được chuẩn hoá (hoa, bỏ dấu) trước khi lưu, unique + sparse để
    // không có 2 phòng ban trùng mã (doc chưa có mã thì code = undefined,
    // không tính là trùng nhau nhờ sparse).
    code: { type: String, trim: true, unique: true, sparse: true, index: true },
    description: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

departmentSchema.pre('save', function computeDerivedFields(next) {
  if (this.isModified('name') || !this.slug) {
    this.slug = normalizeDeptName(this.name);
  }
  if (this.code) {
    this.code = normalizeDeptCode(this.code);
  }
  next();
});

export const Department = mongoose.model('Department', departmentSchema);
/**
 * Script xoá các tài khoản "rác" sinh ra từ những lần import Excel trước khi
 * sửa lỗi đọc nhầm dòng trống/dòng "Ghi chú:" thành dòng nhân viên (mã tạm
 * dạng TMP<số dòng> -> username tmp2, tmp3, ...).
 *
 * Mặc định chạy ở chế độ DRY-RUN: chỉ liệt kê, KHÔNG xoá gì cả.
 * Muốn xoá thật, chạy thêm flag --confirm.
 *
 * Cách chạy (từ thư mục server/):
 *   node src/scripts/cleanup-tmp-employees.js
 *   node src/scripts/cleanup-tmp-employees.js --confirm
 *
 * Có thể chỉnh biến MONGODB_URI nếu .env dùng tên khác.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Employee, User } from '../models/index.js';

const MONGODB_URI =
  process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;

const CONFIRM = process.argv.includes('--confirm');

async function main() {
  if (!MONGODB_URI) {
    console.error(
      'Không tìm thấy MONGODB_URI/MONGO_URI/DB_URI trong biến môi trường. ' +
        'Chỉnh lại tên biến ở đầu file này cho khớp với .env của bạn.',
    );
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('Đã kết nối MongoDB.');

  // Mã nhân viên rác được sinh tự động có dạng "TMP" + số thứ tự dòng Excel,
  // vd TMP7, TMP8... — khớp không phân biệt hoa/thường để chắc chắn không
  // sót nếu có biến thể chữ thường.
  const junkEmployees = await Employee.find({
    employeeCode: { $regex: /^TMP\d+$/i },
  }).lean();

  if (!junkEmployees.length) {
    console.log('Không tìm thấy nhân viên rác nào (mã dạng TMP<số>). Không có gì để xoá.');
    await mongoose.disconnect();
    return;
  }

  const userIds = junkEmployees.map((e) => e.userId).filter(Boolean);
  const users = await User.find({ _id: { $in: userIds } })
    .select('username')
    .lean();
  const usernameById = new Map(users.map((u) => [u._id.toString(), u.username]));

  console.log(`Tìm thấy ${junkEmployees.length} nhân viên rác:`);
  for (const emp of junkEmployees) {
    const username = usernameById.get(emp.userId?.toString()) || '(không có user)';
    console.log(`  - employeeCode=${emp.employeeCode}  username=${username}  fullname="${emp.fullname}"`);
  }

  if (!CONFIRM) {
    console.log(
      '\nĐây là DRY-RUN — chưa xoá gì cả. Chạy lại với flag --confirm để xoá thật:\n' +
        '  node src/scripts/cleanup-tmp-employees.js --confirm',
    );
    await mongoose.disconnect();
    return;
  }

  const empIds = junkEmployees.map((e) => e._id);
  const empResult = await Employee.deleteMany({ _id: { $in: empIds } });
  const userResult = await User.deleteMany({ _id: { $in: userIds } });

  console.log(
    `\nĐã xoá ${empResult.deletedCount} hồ sơ nhân viên và ${userResult.deletedCount} tài khoản tương ứng.`,
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Lỗi khi chạy script:', err);
  process.exit(1);
});
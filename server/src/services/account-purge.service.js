/**
 * Service Xóa Cứng Tài khoản Khóa Lâu Ngày (Account Purge Service).
 * Đảm bảo an toàn dữ liệu: Chỉ xóa cứng tài khoản bị khóa liên tục > 6 tháng và KHÔNG có bất kỳ dấu vết lịch sử nào (chưa từng thi, chưa từng ghi audit log).
 */

import { User, Employee, ExamCandidate, AuditLog } from '../models/index.js';
import { writeAudit } from './audit.service.js';

const PURGE_LOCK_MONTHS = 6; // Ngưỡng thời gian khóa liên tục tối thiểu (6 tháng)

// Tính toán mốc thời gian tối đa để đủ điều kiện xóa (tính lùi 6 tháng từ hiện tại)
function lockedBeforeThreshold(now = new Date()) {
  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() - PURGE_LOCK_MONTHS);
  return threshold;
}

// Kiểm tra tài khoản có dấu vết lịch sử quan trọng cần giữ lại hay không (kỳ thi, nhật ký kiểm toán)
async function hasHistoricalFootprint(user, employee) {
  if (employee) {
    const examCandidateCount = await ExamCandidate.countDocuments({ employeeId: employee._id });
    if (examCandidateCount > 0) return true;
  }
  const auditCount = await AuditLog.countDocuments({ actorUserId: user._id });
  if (auditCount > 0) return true;
  return false;
}

// Quét toàn bộ CSDL và thực hiện xóa cứng các tài khoản thỏa mãn mọi tiêu chí an toàn
export async function purgeExpiredLockedAccounts() {
  const threshold = lockedBeforeThreshold();

  const candidates = await User.find({
    isActive: false,
    lockedAt: { $ne: null, $lte: threshold },
  });

  const purgedUsernames = [];
  let skippedWithHistoryCount = 0;

  for (const user of candidates) {
    const employee = await Employee.findOne({ userId: user._id });
    const hasHistory = await hasHistoricalFootprint(user, employee);

    if (hasHistory) {
      skippedWithHistoryCount += 1;
      continue;
    }

    if (employee) {
      await Employee.deleteOne({ _id: employee._id });
    }
    await User.deleteOne({ _id: user._id });
    purgedUsernames.push(user.username);
  }

  if (purgedUsernames.length > 0 || skippedWithHistoryCount > 0) {
    await writeAudit({
      actorUserId: null,
      action: 'ACCOUNT_PURGE_AUTO',
      resourceType: 'User',
      metadata: {
        purgedCount: purgedUsernames.length,
        purgedUsernames,
        skippedWithHistoryCount,
        lockMonths: PURGE_LOCK_MONTHS,
      },
    }).catch(() => {
      /* audit lỗi không được chặn job xóa */
    });
  }

  return {
    purgedCount: purgedUsernames.length,
    purgedUsernames,
    skippedWithHistoryCount,
  };
}

export { PURGE_LOCK_MONTHS, lockedBeforeThreshold };
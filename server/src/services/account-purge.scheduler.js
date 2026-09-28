/**
 * Tiến trình lập lịch Xóa tài khoản Khóa lâu ngày (Account Purge Scheduler).
 * Tự động chạy định kỳ lúc 04:00 sáng mỗi ngày để dọn dẹp các tài khoản rác bị khóa liên tục > 6 tháng.
 */

import cron from 'node-cron';
import { purgeExpiredLockedAccounts } from './account-purge.service.js';

const CRON_EXPRESSION = '0 4 * * *'; // 04:00 mỗi ngày — sau backup (03:00), trước giờ hành chính
const TIMEZONE = 'Asia/Ho_Chi_Minh';

// Hàm thực thi tác vụ xóa tài khoản hết hạn khóa
async function runAccountPurge() {
  try {
    const { purgedCount, purgedUsernames, skippedWithHistoryCount } = await purgeExpiredLockedAccounts();

    if (purgedCount > 0 || skippedWithHistoryCount > 0) {
      console.log(
        `[account-purge] Đã xóa cứng ${purgedCount} tài khoản khóa quá 6 tháng` +
          (purgedCount > 0 ? `: ${purgedUsernames.join(', ')}` : '') +
          (skippedWithHistoryCount > 0
            ? `. Bỏ qua ${skippedWithHistoryCount} tài khoản vì có dấu vết lịch sử (đã từng thi hoặc từng ghi audit log)`
            : ''),
      );
    }
  } catch (err) {
    console.error('[account-purge] Xóa cứng tài khoản khóa lâu ngày thất bại:', err.message);
  }
}

// Khởi tạo và đăng ký Cron Job khi server khởi động
export function initAccountPurgeScheduler() {
  cron.schedule(CRON_EXPRESSION, runAccountPurge, { timezone: TIMEZONE });
  console.log(`[account-purge] Đã đăng ký cron xóa cứng tài khoản khóa lâu: "${CRON_EXPRESSION}" (${TIMEZONE})`);
}

export { runAccountPurge };
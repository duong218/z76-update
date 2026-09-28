/**
 * Tiến trình lập lịch Sao lưu Tự động (Backup Scheduler).
 * Tự động chạy định kỳ lúc 03:00 sáng mỗi ngày để dump CSDL MongoDB, tải lên Google Drive và ghi nhật ký kiểm toán.
 */

import cron from 'node-cron';
import { backupService } from './backup.service.js';
import { auditService } from './audit.service.js';

const CRON_EXPRESSION = '0 3 * * *'; // 03:00 mỗi ngày
const TIMEZONE = 'Asia/Ho_Chi_Minh';

// Hàm thực thi tác vụ sao lưu và xoay vòng bản backup
async function runScheduledBackup() {
  try {
    const driveFile = await backupService.createBackupToDrive({ prefix: 'z176-auto' });
    const { kept, deleted } = await backupService.rotateDriveBackups();

    console.log(
      `[backup-scheduler] Backup lên Drive thành công: ${driveFile.name} (id=${driveFile.id}). Đang giữ ${kept} bản, đã xoá: ${
        deleted.join(', ') || '(không có)'
      }`
    );

    await auditService.writeAudit({
      actorUserId: null,
      action: 'BACKUP_AUTO_CREATE',
      resourceType: 'Backup',
      resourceId: driveFile.id,
      metadata: { fileName: driveFile.name, kept, deleted },
    });
  } catch (err) {
    console.error('[backup-scheduler] Backup tự động thất bại:', err.message);

    await auditService
      .writeAudit({
        actorUserId: null,
        action: 'BACKUP_AUTO_FAILED',
        resourceType: 'Backup',
        metadata: { error: err.message },
      })
      .catch(() => {});
  }
}

// Khởi tạo và đăng ký Cron Job khi server khởi động
export function initBackupScheduler() {
  cron.schedule(CRON_EXPRESSION, runScheduledBackup, { timezone: TIMEZONE });
  console.log(`[backup-scheduler] Đã đăng ký cron backup tự động: "${CRON_EXPRESSION}" (${TIMEZONE})`);
}

export { runScheduledBackup };
/**
 * CLI backup thủ công — npm run backup
 * Dump MongoDB (mongodump --gzip) -> upload lên Google Drive -> xoay vòng giữ tối đa 5 bản.
 * Dùng chung logic với POST /api/backups (backup.controller.js).
 */
import 'dotenv/config';
import { backupService } from '../services/backup.service.js';

async function main() {
  const prefix = process.argv[2] || 'z176-manual';

  console.log(`[backup-cli] Bắt đầu backup (prefix="${prefix}")...`);

  try {
    const driveFile = await backupService.createBackupToDrive({ prefix });
    console.log(`[backup-cli] Upload thành công: ${driveFile.name} (id=${driveFile.id})`);

    const { kept, deleted } = await backupService.rotateDriveBackups();
    console.log(
      `[backup-cli] Đang giữ ${kept} bản trên Drive. Đã xoá: ${deleted.length ? deleted.join(', ') : '(không có)'}`
    );

    console.log('[backup-cli] Hoàn tất.');
    process.exit(0);
  } catch (err) {
    console.error('[backup-cli] Backup thất bại:', err.message);
    process.exit(1);
  }
}

main();
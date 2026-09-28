/**
 * Service Sao lưu & Khôi phục Dữ liệu MongoDB và Tích hợp Google Drive (Backup Service).
 * Sử dụng công cụ mongodump/mongorestore nén gzip và đồng bộ trực tiếp lên Google Drive qua OAuth2.
 */

import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import fssync from 'fs';
import { google } from 'googleapis';
import { env } from '../config/env.js';
import { ApiError } from '../utils/api-error.js';

const MAX_BACKUPS_KEPT = 5;
const TMP_DIR = path.join(os.tmpdir(), 'z176-backups');

// Đảm bảo thư mục lưu file nén tạm tồn tại trên server
async function ensureTmpDir() {
  await fs.mkdir(TMP_DIR, { recursive: true });
}

// Kiểm tra đầy đủ thông tin xác thực Google OAuth2 trong biến môi trường
function assertGoogleConfigured() {
  const { clientId, clientSecret, refreshToken, folderId } = env.googleBackup;
  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    throw new ApiError(
      500,
      'Chưa cấu hình Google Drive backup (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN / GOOGLE_DRIVE_BACKUP_FOLDER_ID).',
      'GOOGLE_BACKUP_NOT_CONFIGURED'
    );
  }
}

// Khởi tạo Google Drive API Client bằng OAuth2 Refresh Token (cho phép ghi vào Drive cá nhân)
function getDriveClient() {
  assertGoogleConfigured();
  const { clientId, clientSecret, refreshToken } = env.googleBackup;

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  return google.drive({ version: 'v3', auth: oAuth2Client });
}

// Thực thi lệnh hệ thống ngoài (mongodump / mongorestore)
function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      reject(
        new ApiError(
          500,
          `Không thể chạy lệnh "${cmd}". Cần cài mongodb-database-tools trên server. Chi tiết: ${err.message}`,
          'BACKUP_TOOL_NOT_FOUND'
        )
      );
    });
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(
        new ApiError(500, `Lệnh "${cmd}" thất bại (mã ${code}): ${stderr.slice(-2000)}`, 'BACKUP_COMMAND_FAILED')
      );
    });
  });
}

// Xóa file tạm cục bộ sau khi hoàn thành thao tác
async function cleanupLocalFile(filePath) {
  try {
    if (filePath && fssync.existsSync(filePath)) {
      await fs.unlink(filePath);
    }
  } catch {
    /* best-effort cleanup */
  }
}

// Chạy mongodump xuất CSDL ra file .gz nén trong thư mục tạm
async function dumpToLocalFile(prefix = 'z176-backup') {
  await ensureTmpDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${prefix}-${timestamp}.gz`;
  const filePath = path.join(TMP_DIR, fileName);

  await runCommand('mongodump', [`--uri=${env.mongodbUri}`, `--archive=${filePath}`, '--gzip']);

  const stat = await fs.stat(filePath);
  return { filePath, fileName, size: stat.size };
}

// Tải file nén .gz lên thư mục sao lưu trên Google Drive
async function uploadToDrive(filePath, fileName) {
  const drive = getDriveClient();
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [env.googleBackup.folderId],
    },
    media: {
      mimeType: 'application/gzip',
      body: fssync.createReadStream(filePath),
    },
    fields: 'id, name, size, createdTime',
  });
  return res.data;
}

// Quy trình sao lưu trọn gói: Dump DB -> Upload Drive -> Dọn file tạm
async function createBackupToDrive({ prefix = 'z176-backup' } = {}) {
  const { filePath, fileName } = await dumpToLocalFile(prefix);
  try {
    const driveFile = await uploadToDrive(filePath, fileName);
    return driveFile;
  } finally {
    await cleanupLocalFile(filePath);
  }
}

// Lấy danh sách các file backup đang lưu trên Google Drive (mới nhất xếp trước)
async function listDriveBackups() {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${env.googleBackup.folderId}' in parents and trashed = false`,
    fields: 'files(id, name, size, createdTime)',
    orderBy: 'createdTime desc',
    pageSize: 100,
  });
  return res.data.files ?? [];
}

// Xoay vòng bản sao lưu: Giữ tối đa N bản mới nhất, tự động xóa các bản cũ hơn trên Google Drive
async function rotateDriveBackups(maxKept = MAX_BACKUPS_KEPT) {
  const drive = getDriveClient();
  const files = await listDriveBackups();
  const toDelete = files.slice(maxKept);

  for (const file of toDelete) {
    await drive.files.delete({ fileId: file.id });
  }
  return { kept: files.length - toDelete.length, deleted: toDelete.map((f) => f.name) };
}

// Tải file từ Drive về thư mục tạm cục bộ
async function downloadDriveFileToLocal(fileId, fileName) {
  await ensureTmpDir();
  const drive = getDriveClient();
  const filePath = path.join(TMP_DIR, `download-${Date.now()}-${fileName}`);

  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

  await new Promise((resolve, reject) => {
    const dest = fssync.createWriteStream(filePath);
    res.data.pipe(dest).on('finish', resolve).on('error', reject);
  });

  return filePath;
}

// Stream trực tiếp dữ liệu file từ Google Drive ra HTTP response cho client tải về
async function streamDriveFileToResponse(fileId, res) {
  const drive = getDriveClient();
  const driveRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  driveRes.data.pipe(res);
}

// Khôi phục dữ liệu CSDL từ file .gz (mongorestore --drop sẽ xóa sạch dữ liệu hiện tại trước khi phục hồi)
async function restoreFromLocalFile(localFilePath) {
  await runCommand('mongorestore', [`--uri=${env.mongodbUri}`, `--archive=${localFilePath}`, '--gzip', '--drop']);
}

export const backupService = {
  createBackupToDrive,
  listDriveBackups,
  rotateDriveBackups,
  downloadDriveFileToLocal,
  streamDriveFileToResponse,
  restoreFromLocalFile,
  cleanupLocalFile,
  MAX_BACKUPS_KEPT,
};
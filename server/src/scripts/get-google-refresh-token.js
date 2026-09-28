/**
 * Chạy 1 lần để lấy Refresh Token cho Google Drive OAuth (Gmail cá nhân).
 * Cách dùng:
 *   1. Thêm vào .env: GOOGLE_OAUTH_CLIENT_ID=... và GOOGLE_OAUTH_CLIENT_SECRET=...
 *      (lấy từ Google Cloud Console -> Credentials -> OAuth client "z176-backup")
 *   2. node scripts/get-google-refresh-token.js
 *   3. Trình duyệt tự mở -> đăng nhập đúng Gmail cá nhân dùng để backup -> Allow.
 *   4. Copy "Refresh Token" in ra terminal, dán vào .env: GOOGLE_REFRESH_TOKEN=...
 *   5. GOOGLE_OAUTH_CLIENT_ID/SECRET vẫn cần giữ lại trong .env vì backup.service.js
 *      dùng chúng để đổi refresh token lấy access token mỗi lần backup.
 */
import 'dotenv/config';
import { google } from 'googleapis';
import http from 'http';
import open from 'open'; // nếu chưa có: npm install open --save-dev

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:4567/oauth2callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Thiếu GOOGLE_OAUTH_CLIENT_ID hoặc GOOGLE_OAUTH_CLIENT_SECRET trong .env');
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline', // bắt buộc để nhận refresh_token
  prompt: 'consent', // bắt buộc để luôn trả refresh_token (nếu không sẽ chỉ có ở lần cấp quyền đầu tiên)
  scope: ['https://www.googleapis.com/auth/drive'],
});

console.log('Mở link này trong trình duyệt (hoặc sẽ tự mở):\n', authUrl, '\n');

const server = http
  .createServer(async (req, res) => {
    if (!req.url.startsWith('/oauth2callback')) return;

    const url = new URL(req.url, REDIRECT_URI);
    const code = url.searchParams.get('code');

    res.end('Đã nhận mã xác thực. Bạn có thể đóng tab này và quay lại terminal.');
    server.close();

    try {
      const { tokens } = await oAuth2Client.getToken(code);
      console.log('\n=== THÀNH CÔNG ===');
      console.log('Refresh Token:', tokens.refresh_token);
      console.log('\nDán dòng sau vào .env:');
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    } catch (err) {
      console.error('Lỗi khi đổi code lấy token:', err.message);
    }
  })
  .listen(4567, () => {
    open(authUrl).catch(() => {
      console.log('Không tự mở được trình duyệt, hãy copy link ở trên dán vào trình duyệt thủ công.');
    });
  });
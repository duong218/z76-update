import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { authenticate, requireRoleCodes } from '../middlewares/auth.middleware.js';
import { requirePasswordChanged } from '../middlewares/require-password-changed.middleware.js';
import { uploadExcel } from '../middlewares/upload.middleware.js';
import { ApiError } from '../utils/api-error.js';

const router = Router();
const adminOnly = requireRoleCodes('admin');

router.use(authenticate, adminOnly, requirePasswordChanged);

router.get('/', userController.list);

// MỚI: xuất danh sách tài khoản nhân viên (role candidate) ra Excel kèm
// username + mật khẩu tạm. Dùng POST (không phải GET) vì đây là hành động
// có side-effect quan trọng: RESET MẬT KHẨU của toàn bộ tài khoản candidate
// đang hoạt động, không chỉ đọc dữ liệu.
router.post('/export-credentials', userController.exportCandidateCredentials);

// MỚI: import Excel tách làm 2 bước — preview (đọc file, phân loại từng dòng,
// KHÔNG ghi DB) rồi confirm (nhận lại đúng danh sách rows đã phân loại đó,
// ghi thật). Giúp admin thấy trước dòng nào sẽ ghi đè lên tài khoản đã khóa
// của ai, và dòng nào trùng tài khoản đang hoạt động, trước khi bấm xác nhận.
router.post(
  '/import/preview',
  (req, res, next) => {
    uploadExcel(req, res, (err) => {
      if (err instanceof ApiError) {
        next(err);
        return;
      }
      if (err) {
        next(new ApiError(400, err.message ?? 'Upload thất bại', 'IMPORT_UPLOAD_ERROR'));
        return;
      }
      next();
    });
  },
  userController.previewImportExcel,
);

router.post('/import/confirm', userController.confirmImportExcel);

router.post('/', userController.create);
router.patch('/:id/role', userController.updateRole);
router.patch('/:id/lock', userController.toggleLock);
router.post('/:id/reset-password', userController.resetPassword);

export default router;
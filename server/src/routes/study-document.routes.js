import { Router } from 'express';
import * as studyDocumentController from '../controllers/study-document.controller.js';
import { authenticate, requireRoleCodes } from '../middlewares/auth.middleware.js';
import { requirePasswordChanged } from '../middlewares/require-password-changed.middleware.js';
import { uploadStudyDocument } from '../middlewares/upload.middleware.js';

const router = Router();

router.use(authenticate, requirePasswordChanged);

// Candidate xem tài liệu (đặt trước '/:id/file' để tránh nhầm path)
router.get('/candidate', requireRoleCodes('candidate'), studyDocumentController.listForCandidate);

// admin/examiner/leader quản lý
router.get('/', requireRoleCodes('admin', 'examiner', 'leader'), studyDocumentController.list);
router.post('/', requireRoleCodes('admin', 'examiner'), uploadStudyDocument, studyDocumentController.create);
router.delete('/:id', requireRoleCodes('admin', 'examiner'), studyDocumentController.remove);

// Xem/tải file — mọi role đã đăng nhập, quyền phòng ban kiểm tra trong service
router.get('/:id/file', studyDocumentController.download);

export default router;
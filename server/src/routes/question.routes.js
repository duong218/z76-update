import { Router } from 'express';
import * as questionController from '../controllers/question.controller.js';
import { authenticate, requireRoleCodes } from '../middlewares/auth.middleware.js';
import { requirePasswordChanged } from '../middlewares/require-password-changed.middleware.js';
import { uploadExcel, uploadQuestionImage } from '../middlewares/upload.middleware.js';
import { ApiError } from '../utils/api-error.js';

const router = Router();
const bankRoles = requireRoleCodes('admin', 'examiner');

router.use(authenticate, bankRoles, requirePasswordChanged);

router.get('/', questionController.list);
router.post('/import/preview', (req, res, next) => {
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
}, questionController.previewImport);

router.post('/import/confirm', questionController.confirmImport);

router.post('/upload-image', (req, res, next) => {
  uploadQuestionImage(req, res, (err) => {
    if (err instanceof ApiError) {
      next(err);
      return;
    }
    if (err) {
      next(new ApiError(400, err.message ?? 'Upload thất bại', 'IMAGE_UPLOAD_ERROR'));
      return;
    }
    next();
  });
}, questionController.uploadImage);

router.get('/stats/by-topic/:topicId', questionController.getStatsByTopic);
router.post('/bulk-delete', questionController.bulkRemove);
router.get('/:id', questionController.getById);
router.post('/', questionController.create);
router.patch('/:id', questionController.update);
router.delete('/:id', questionController.remove);

export default router;
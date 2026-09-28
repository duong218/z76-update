import express from 'express';
import { practiceController } from '../controllers/practice.controller.js';
import { authenticate, requireRoleCodes } from '../middlewares/auth.middleware.js';
import { requirePasswordChanged } from '../middlewares/require-password-changed.middleware.js';

const router = express.Router();

router.use(authenticate, requirePasswordChanged, requireRoleCodes('candidate'));

router.get('/topics', practiceController.topics);
router.get('/progress', practiceController.progress);
router.post('/start', practiceController.start);
router.post('/:id/check', practiceController.check);
router.post('/:id/submit', practiceController.submit);

export default router;
import { Router } from 'express';
import * as topicController from '../controllers/topic.controller.js';
import { authenticate, requireRoleCodes } from '../middlewares/auth.middleware.js';
import { requirePasswordChanged } from '../middlewares/require-password-changed.middleware.js';

const router = Router();
const bankRoles = requireRoleCodes('admin', 'examiner');

router.use(authenticate, bankRoles, requirePasswordChanged);

router.get('/', topicController.list);
router.post('/', topicController.create);
router.patch('/:id', topicController.update);
router.delete('/:id', topicController.remove);

export default router;
import { Router } from 'express';
import * as departmentController from '../controllers/department.controller.js';
import { authenticate, requireRoleCodes } from '../middlewares/auth.middleware.js';
import { requirePasswordChanged } from '../middlewares/require-password-changed.middleware.js';

const router = Router();
const bankRoles = requireRoleCodes('admin', 'examiner');

router.use(authenticate, bankRoles, requirePasswordChanged);

router.get('/', departmentController.list);
router.post('/', departmentController.create);
router.patch('/:id', departmentController.update);
router.delete('/:id', departmentController.remove);

export default router;
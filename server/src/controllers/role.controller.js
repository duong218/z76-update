/**
 * Controller Danh mục Vai trò & Quyền hạn (Role Controller).
 */

import * as roleService from '../services/role.service.js';
import { asyncHandler } from '../utils/async-handler.js';

// Lấy danh sách toàn bộ các vai trò (Roles) trong hệ thống
export const list = asyncHandler(async (req, res) => {
  const data = await roleService.listRoles();
  res.json({ success: true, message: 'OK', code: 'ROLE_LIST_OK', data });
});


/**
 * Service Danh mục Vai trò & Phân quyền (Role Service).
 */

import { Role } from '../models/index.js';

// Lấy danh sách các vai trò đang kích hoạt, sắp xếp theo thời gian tạo
export async function listRoles() {
  return Role.find({ isActive: true }).sort({ createdAt: 1 }).lean();
}


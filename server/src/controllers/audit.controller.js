/**
 * Controller Quản lý Nhật ký Kiểm toán & Bảo mật (Audit Log Controller).
 * Hỗ trợ tra cứu, phân trang và lọc lịch sử các hành động quan trọng trong hệ thống.
 */

import { asyncHandler } from '../utils/async-handler.js';
import { auditService } from '../services/audit.service.js';

export const auditController = {
  // Lấy danh sách nhật ký kiểm toán theo bộ lọc (loại hành động, tài nguyên, thời gian, từ khóa)
  getAuditLogs: asyncHandler(async (req, res) => {
    const filters = {
      page: req.query.page,
      limit: req.query.limit,
      action: req.query.action,
      resourceType: req.query.resourceType,
      from: req.query.from,
      to: req.query.to,
      q: req.query.q,
    };
    const data = await auditService.getAuditLogs(filters);
    res.json({
      success: true,
      data: data.items,
      pagination: data.pagination,
    });
  }),
};
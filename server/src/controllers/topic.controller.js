/**
 * Controller Quản lý Chủ đề / Chuyên môn Câu hỏi (Topic Management).
 * Hỗ trợ tạo mới, cập nhật, khôi phục chủ đề cũ và chặn gỡ bỏ chủ đề khi đang gắn liền với kỳ thi đang kích hoạt.
 */

import * as topicService from '../services/topic.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ApiError } from '../utils/api-error.js';
import { writeAudit } from '../services/audit.service.js';

// Lấy danh sách các chuyên môn / chủ đề
export const list = asyncHandler(async (req, res) => {
  const activeOnly = req.query.activeOnly !== 'false';
  // ?withCounts=true -> kèm số câu hỏi theo từng ngân hàng (exam/practice) của mỗi chủ đề
  const withCounts = req.query.withCounts === 'true';
  const data = await topicService.listTopics({ activeOnly, withCounts });
  res.json({ success: true, message: 'OK', code: 'TOPIC_LIST_OK', data });
});

// Tạo chủ đề mới hoặc tự động khôi phục chủ đề cũ đã từng bị vô hiệu hóa
export const create = asyncHandler(async (req, res) => {
  const { name, description } = req.body ?? {};
  const data = await topicService.createTopic({ name, description });

  await writeAudit({
    actorUserId: req.auth.userId,
    action: data.restored ? 'RESTORE_TOPIC' : 'CREATE_TOPIC',
    resourceType: 'Topic',
    resourceId: data._id,
    metadata: {
      detail: data.restored
        ? `Khôi phục chủ đề đã bị vô hiệu hoá trước đó: ${name}`
        : `Tạo chủ đề mới: ${name}`,
    },
    ipAddress: req.ip,
  });
  res.status(201).json({
    success: true,
    message: data.restored
      ? 'Đã khôi phục chủ đề trước đó bị vô hiệu hoá — các câu hỏi cũ thuộc chủ đề này cũng dùng lại được'
      : 'Tạo chủ đề thành công',
    code: data.restored ? 'TOPIC_RESTORED' : 'TOPIC_CREATED',
    data,
  });
});

// Cập nhật thông tin chủ đề
export const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, isActive } = req.body ?? {};
  const data = await topicService.updateTopic(id, { name, description, isActive });

  await writeAudit({
    actorUserId: req.auth.userId,
    action: 'UPDATE_TOPIC',
    resourceType: 'Topic',
    resourceId: data._id ?? id,
    metadata: { detail: `Cập nhật chủ đề: ${data.name}` },
    ipAddress: req.ip,
  });
  res.json({
    success: true,
    message: 'Cập nhật chủ đề thành công',
    code: 'TOPIC_UPDATED',
    data,
  });
});

// Các mã lỗi chặn cứng khi ngừng sử dụng chủ đề (TOPIC_HAS_EXPIRED_EXAM chỉ là cảnh báo cần xác nhận nên không ghi nhật ký chặn)
const BLOCKING_TOPIC_CODES = ['TOPIC_HAS_ACTIVE_EXAM', 'TOPIC_HAS_PENDING_EXAM', 'TOPIC_HAS_APPROVED_EXAM'];

// Ngừng sử dụng chủ đề (chặn nếu đang có kỳ thi đang diễn ra / chờ duyệt / đã duyệt chưa đăng; cảnh báo nếu chỉ có kỳ thi đã duyệt quá hạn)
export const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // force=true: người dùng đã xác nhận bỏ qua cảnh báo kỳ thi đã duyệt nhưng quá hạn
  const force = req.query.force === 'true';

  let data;
  try {
    data = await topicService.deactivateTopic(id, { force });
  } catch (err) {
    if (err instanceof ApiError && BLOCKING_TOPIC_CODES.includes(err.code)) {
      await writeAudit({
        actorUserId: req.auth.userId,
        action: 'DEACTIVATE_TOPIC_BLOCKED',
        resourceType: 'Topic',
        resourceId: id,
        metadata: { detail: `Bị chặn ngừng sử dụng chủ đề (${err.code}): ${err.message}` },
        ipAddress: req.ip,
      });
    }
    throw err;
  }

  await writeAudit({
    actorUserId: req.auth.userId,
    action: 'DEACTIVATE_TOPIC',
    resourceType: 'Topic',
    resourceId: id,
    metadata: { detail: `Ngừng sử dụng chủ đề: ${id}` },
    ipAddress: req.ip,
  });
  res.json({
    success: true,
    message: 'Đã ngừng sử dụng chủ đề',
    code: 'TOPIC_DEACTIVATED',
    data,
  });
});
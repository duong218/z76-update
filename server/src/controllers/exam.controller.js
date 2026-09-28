/**
 * Controller Quản trị Kỳ thi (Exam Management).
 * Điều phối vòng đời kỳ thi: Tạo đề xuất -> Gửi duyệt -> Duyệt/Từ chối -> Công bố kỳ thi (Publish) -> Lưu trữ.
 */

import { examService } from '../services/exam.service.js';
import { writeAudit } from '../services/audit.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ApiError } from '../utils/api-error.js';

function clientIp(req) {
  return req.ip ?? req.headers['x-forwarded-for']?.toString()?.split(',')[0]?.trim();
}

export const examController = {
  // Lấy danh sách kỳ thi (phân quyền: examiner chỉ xem kỳ thi do mình tạo)
  list: asyncHandler(async (req, res) => {
    const filters = {
      status: req.query.status,
      topicId: req.query.topicId,
    };

    if (req.auth?.roleCode === 'examiner') {
      filters.createdBy = req.auth.userId;
    }

    const data = await examService.listExams(filters);
    res.json({ success: true, message: 'OK', data });
  }),

  // Examiner tạo mới bản thảo đề xuất kỳ thi
  create: asyncHandler(async (req, res) => {
    const data = await examService.createExamProposal(req.body, req.auth.userId);

    await writeAudit({
      actorUserId: req.auth.userId,
      action: 'CREATE_EXAM',
      resourceType: 'Exam',
      resourceId: data._id,
      metadata: { detail: `Tạo đề xuất kỳ thi: ${data.title}` },
      ipAddress: clientIp(req),
    });

    res.status(201).json({ success: true, message: 'Tạo đề xuất thành công', data });
  }),

  // Examiner sửa lại đề xuất của mình (áp dụng cho đề đang ở trạng thái
  // draft hoặc rejected) — đề tự động quay về draft sau khi sửa.
  update: asyncHandler(async (req, res) => {
    const data = await examService.updateExamProposal(req.params.id, req.body, req.auth.userId);

    await writeAudit({
      actorUserId: req.auth.userId,
      action: 'UPDATE_EXAM',
      resourceType: 'Exam',
      resourceId: data._id,
      metadata: { detail: `Chỉnh sửa đề xuất kỳ thi: ${data.title}` },
      ipAddress: clientIp(req),
    });

    res.json({ success: true, message: 'Đã lưu thay đổi', data });
  }),

  // Examiner nộp bản thảo đề xuất kỳ thi lên cấp trên chờ duyệt
  submit: asyncHandler(async (req, res) => {
    const data = await examService.submitExamForReview(req.params.id, req.auth.userId);

    await writeAudit({
      actorUserId: req.auth.userId,
      action: 'SUBMIT_EXAM',
      resourceType: 'Exam',
      resourceId: data._id,
      metadata: { detail: `Gửi duyệt kỳ thi: ${data.title}` },
      ipAddress: clientIp(req),
    });

    res.json({ success: true, message: 'Gửi duyệt thành công', data });
  }),

  // Leader phê duyệt kỳ thi và thiết lập khung thời gian bắt đầu / kết thúc
  approve: asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.body ?? {};
    const data = await examService.approveExam(req.params.id, { startDate, endDate }, req.auth.userId);

    await writeAudit({
      actorUserId: req.auth.userId,
      action: 'APPROVE_EXAM',
      resourceType: 'Exam',
      resourceId: data._id,
      metadata: { detail: `Chấp thuận kỳ thi: ${data.title}` },
      ipAddress: clientIp(req),
    });

    res.json({ success: true, message: 'Đã duyệt kỳ thi', data });
  }),

  // Leader từ chối đề xuất kỳ thi kèm lý do
  reject: asyncHandler(async (req, res) => {
    const { rejectionReason } = req.body ?? {};
    const data = await examService.rejectExam(req.params.id, rejectionReason, req.auth.userId);

    await writeAudit({
      actorUserId: req.auth.userId,
      action: 'REJECT_EXAM',
      resourceType: 'Exam',
      resourceId: data._id,
      metadata: { detail: `Từ chối kỳ thi: ${data.title}` },
      ipAddress: clientIp(req),
    });

    res.json({ success: true, message: 'Đã từ chối kỳ thi', data });
  }),

  // Công bố kỳ thi (Publish): Tự động sinh mã đề trộn ngẫu nhiên và gửi thông báo tới thí sinh
  publish: asyncHandler(async (req, res) => {
    const data = await examService.publishExam(req.params.id, req.auth.userId);

    await writeAudit({
      actorUserId: req.auth.userId,
      action: 'PUBLISH_EXAM',
      resourceType: 'Exam',
      resourceId: data._id,
      metadata: { detail: `Đăng chính thức kỳ thi: ${data.title}` },
      ipAddress: clientIp(req),
    });

    res.json({ success: true, message: 'Đã đăng chính thức kỳ thi', data });
  }),

  // Bỏ qua / Lưu trữ (Archive) kỳ thi sau khi hoàn thành
  archive: asyncHandler(async (req, res) => {
    const data = await examService.archiveExam(req.params.id, req.auth.userId);

    await writeAudit({
      actorUserId: req.auth.userId,
      action: 'ARCHIVE_EXAM',
      resourceType: 'Exam',
      resourceId: data._id,
      metadata: { detail: `Bỏ qua (lưu trữ) kỳ thi: ${data.title}` },
      ipAddress: clientIp(req),
    });

    res.json({ success: true, message: 'Đã bỏ qua kỳ thi', data });
  }),

  // Lấy kỳ thi đang được kích hoạt hiện tại
  getActive: asyncHandler(async (req, res) => {
    const data = await examService.getActiveExam();
    res.json({ success: true, message: 'OK', data });
  }),
};
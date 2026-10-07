/**
 * Service Quản lý Chủ đề / Chuyên môn Câu hỏi (Topic Service).
 * Hỗ trợ tạo mới, cập nhật, tự động khôi phục chủ đề cũ đã xóa mềm và bảo vệ toàn vẹn dữ liệu kỳ thi
 * (đang chờ duyệt, đã duyệt chưa đăng, đang diễn ra) khi ngừng sử dụng chủ đề.
 */

import { Topic, Question, Exam, EXAM_STATUS } from '../models/index.js';
import { ApiError, assertFound } from '../utils/api-error.js';
import { QUESTION_USAGE } from '../models/constants.js';

// Lấy danh sách toàn bộ chủ đề câu hỏi.
// withCounts = true: gắn thêm `questionCounts: { exam, practice }` (số câu hỏi đang hoạt động của từng ngân hàng)
// cho mỗi chủ đề, tính bằng 1 lần aggregate. Mặc định tắt để các nơi khác gọi danh sách chủ đề không tốn thêm truy vấn.
// Cách phân loại giống questionUsageFilter(): 'practice' -> ôn tập; mọi giá trị khác (kể cả câu cũ thiếu usage) -> thi chính thức.
export async function listTopics({ activeOnly = true, withCounts = false } = {}) {
  const filter = activeOnly ? { isActive: true } : {};
  const topics = await Topic.find(filter).sort({ name: 1 }).lean();
  if (!withCounts || topics.length === 0) return topics;

  const rows = await Question.aggregate([
    { $match: { isActive: true, topicId: { $in: topics.map((t) => t._id) } } },
    { $group: { _id: { topicId: '$topicId', usage: '$usage' }, count: { $sum: 1 } } },
  ]);

  const countsByTopic = new Map();
  for (const { _id, count } of rows) {
    const key = String(_id.topicId);
    const entry = countsByTopic.get(key) ?? { exam: 0, practice: 0 };
    if (_id.usage === QUESTION_USAGE.PRACTICE) entry.practice += count;
    else entry.exam += count;
    countsByTopic.set(key, entry);
  }

  return topics.map((t) => ({
    ...t,
    questionCounts: countsByTopic.get(String(t._id)) ?? { exam: 0, practice: 0 },
  }));
}

// Hàm phụ trợ escape ký tự đặc biệt trong Regex
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Tạo chủ đề mới (tự động khôi phục nếu tên trùng với chủ đề đã xóa mềm trước đó)
export async function createTopic({ name, description }) {
  const trimmed = name?.trim();
  if (!trimmed) {
    throw new ApiError(400, 'Tên chủ đề là bắt buộc', 'TOPIC_VALIDATION');
  }

  const inactiveMatch = await Topic.findOne({
    name: { $regex: `^${escapeRegExp(trimmed)}$`, $options: 'i' },
    isActive: false,
  });
  if (inactiveMatch) {
    inactiveMatch.isActive = true;
    inactiveMatch.name = trimmed;
    if (description !== undefined) inactiveMatch.description = description?.trim() || '';
    await inactiveMatch.save();
    return { ...inactiveMatch.toObject(), restored: true };
  }

  try {
    const doc = await Topic.create({ name: trimmed, description: description?.trim() });
    return { ...doc.toObject(), restored: false };
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'Chủ đề đã tồn tại', 'TOPIC_DUPLICATE');
    }
    throw err;
  }
}

const formatVN = (value) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

// Quyết định có được ngừng sử dụng chủ đề hay không, dựa trên các kỳ thi dùng chủ đề đó (hàm thuần, không đụng DB).
// Trả về null nếu được phép, hoặc { code, message } nếu bị chặn / cần xác nhận. Thứ tự ưu tiên:
// 1) Đang diễn ra (published)               -> CHẶN, đợi kỳ thi kết thúc.
// 2) Đang chờ Người duyệt đề (pending_review) -> CHẶN, đợi duyệt/từ chối xong.
// 3) Đã duyệt, chưa đăng, CÒN hạn            -> CHẶN, đợi kỳ thi được đăng và kết thúc (hoặc bị "Bỏ qua").
// 4) Đã duyệt nhưng QUÁ HẠN (không đăng được nữa, publishExam trả EXAM_DATES_EXPIRED) -> chỉ CẢNH BÁO để người dùng
//    xác nhận; đồng ý (force = true) thì cho ngừng sử dụng, vì kỳ thi đó đã bị vô hiệu do quá hạn từ trước.
export function evaluateTopicDeactivation(topicName, exams, { now = new Date(), force = false } = {}) {
  const ofStatus = (status) => exams.filter((e) => e.status === status);

  const published = ofStatus(EXAM_STATUS.PUBLISHED)[0];
  if (published) {
    return {
      code: 'TOPIC_HAS_ACTIVE_EXAM',
      message: `Không thể ngừng sử dụng chủ đề "${topicName}" vì chủ đề này đang được dùng cho kỳ thi "${published.title}" đang diễn ra. Vui lòng đợi kỳ thi kết thúc rồi thử lại.`,
    };
  }

  const pending = ofStatus(EXAM_STATUS.PENDING_REVIEW)[0];
  if (pending) {
    return {
      code: 'TOPIC_HAS_PENDING_EXAM',
      message: `Không thể ngừng sử dụng chủ đề "${topicName}" vì chủ đề này đang có đề xuất kỳ thi "${pending.title}" chờ Người duyệt đề xem xét. Vui lòng đợi đề xuất được duyệt hoặc từ chối rồi thử lại.`,
    };
  }

  const approved = ofStatus(EXAM_STATUS.APPROVED);
  const live = approved.find((e) => !e.endDate || new Date(e.endDate) > now);
  if (live) {
    return {
      code: 'TOPIC_HAS_APPROVED_EXAM',
      message: `Không thể ngừng sử dụng chủ đề "${topicName}" vì chủ đề này đã được duyệt cho kỳ thi "${live.title}" nhưng chưa đăng chính thức. Vui lòng đợi kỳ thi được đăng và kết thúc rồi thử lại (hoặc nhờ Người duyệt đề chọn "Bỏ qua" đề xuất này).`,
    };
  }

  const expired = approved.filter((e) => e.endDate && new Date(e.endDate) <= now);
  if (expired.length > 0 && force !== true) {
    const list = expired.map((e) => `"${e.title}" (kết thúc lúc ${formatVN(e.endDate)})`).join(', ');
    return {
      code: 'TOPIC_HAS_EXPIRED_EXAM',
      message: `Chủ đề "${topicName}" có kỳ thi đã duyệt nhưng quá hạn mà chưa được đăng: ${list}. Kỳ thi này không thể đăng chính thức nữa nên việc ngừng sử dụng chủ đề không ảnh hưởng đến thí sinh. Bạn có chắc muốn tiếp tục ngừng sử dụng chủ đề không?`,
    };
  }

  return null;
}

// Nạp các kỳ thi liên quan rồi áp dụng evaluateTopicDeactivation; bị chặn/cần xác nhận thì ném ApiError 409.
async function assertTopicDeactivatable(topic, { force = false } = {}) {
  const exams = await Exam.find({
    topicId: topic._id,
    status: { $in: [EXAM_STATUS.PUBLISHED, EXAM_STATUS.PENDING_REVIEW, EXAM_STATUS.APPROVED] },
  })
    .select('title status endDate')
    .lean();
  const verdict = evaluateTopicDeactivation(topic.name, exams, { force });
  if (verdict) throw new ApiError(409, verdict.message, verdict.code);
}

// Cập nhật tên và mô tả của chủ đề
export async function updateTopic(id, { name, description, isActive } = {}) {
  const topic = await Topic.findById(id);
  assertFound(topic, 'Không tìm thấy chủ đề', 'TOPIC_NOT_FOUND');

  if (name !== undefined) {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw new ApiError(400, 'Tên chủ đề là bắt buộc', 'TOPIC_VALIDATION');
    }
    topic.name = trimmed;
  }
  if (description !== undefined) topic.description = description?.trim() || '';
  if (isActive !== undefined) {
    // Tắt chủ đề qua PATCH cũng phải qua đúng các kiểm tra như khi xóa (tránh lách bằng cách gọi API trực tiếp).
    if (!isActive && topic.isActive) await assertTopicDeactivatable(topic);
    topic.isActive = Boolean(isActive);
  }

  try {
    await topic.save();
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'Chủ đề đã tồn tại', 'TOPIC_DUPLICATE');
    }
    throw err;
  }
  return topic.toObject();
}

// Ngừng kích hoạt chủ đề (Xóa mềm). Bị chặn nếu chủ đề đang gắn với kỳ thi published / chờ duyệt / đã duyệt chưa đăng;
// nếu chỉ còn kỳ thi đã duyệt nhưng quá hạn thì cảnh báo trước, truyền force = true để xác nhận tiếp tục.
export async function deactivateTopic(id, { force = false } = {}) {
  const topic = await Topic.findById(id);
  assertFound(topic, 'Không tìm thấy chủ đề', 'TOPIC_NOT_FOUND');

  await assertTopicDeactivatable(topic, { force });

  topic.isActive = false;
  await topic.save();

  // Đồng thời vô hiệu hóa tất cả câu hỏi thuộc chủ đề này
  await Question.updateMany({ topicId: topic._id, isActive: true }, { isActive: false });

  return { id: topic._id.toString(), isActive: false };
}

// Tìm hoặc tự động tạo chủ đề theo tên (dùng trong luồng import Excel câu hỏi)
export async function findOrCreateTopicByName(name) {
  const trimmed = name?.trim();
  if (!trimmed) {
    throw new ApiError(400, 'Tên chủ đề là bắt buộc', 'TOPIC_VALIDATION');
  }

  let topic = await Topic.findOne({
    name: { $regex: `^${escapeRegExp(trimmed)}$`, $options: 'i' },
  });
  if (!topic) {
    topic = await Topic.create({ name: trimmed });
  } else if (!topic.isActive) {
    topic.isActive = true;
    await topic.save();
  }
  return topic;
}

// Lấy thông tin chi tiết một chủ đề theo ID
export async function getTopicById(id) {
  const topic = await Topic.findById(id);
  assertFound(topic, 'Không tìm thấy chủ đề', 'TOPIC_NOT_FOUND');
  return topic;
}
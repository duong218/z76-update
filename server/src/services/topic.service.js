/**
 * Service Quản lý Chủ đề / Chuyên môn Câu hỏi (Topic Service).
 * Hỗ trợ tạo mới, cập nhật, tự động khôi phục chủ đề cũ đã xóa mềm và bảo vệ toàn vẹn dữ liệu kỳ thi đang diễn ra.
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
  if (isActive !== undefined) topic.isActive = Boolean(isActive);

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

// Ngừng kích hoạt chủ đề (Xóa mềm và chặn nếu chủ đề đang được dùng bởi kỳ thi published)
export async function deactivateTopic(id) {
  const topic = await Topic.findById(id);
  assertFound(topic, 'Không tìm thấy chủ đề', 'TOPIC_NOT_FOUND');

  const activeExam = await Exam.findOne({ topicId: topic._id, status: EXAM_STATUS.PUBLISHED });
  if (activeExam) {
    throw new ApiError(
      409,
      `Không thể ngừng sử dụng chủ đề "${topic.name}" vì chủ đề này đang được dùng cho kỳ thi "${activeExam.title}" đang diễn ra. Vui lòng đợi kỳ thi kết thúc rồi thử lại.`,
      'TOPIC_HAS_ACTIVE_EXAM',
    );
  }

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
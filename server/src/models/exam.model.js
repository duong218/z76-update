import mongoose from 'mongoose';
import { EXAM_STATUS } from './constants.js';

const examSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      index: true,
    },
    startDate: { type: Date },
    endDate: { type: Date },
    durationMinutes: { type: Number, required: true, min: 1 },
    totalQuestions: { type: Number, required: true, min: 1 },
    commonQuestionCount: { type: Number, required: true, min: 0 },
    departmentQuestionCount: { type: Number, required: true, min: 0 },
    /**
     * MỚI — Công tắc BÙ CÂU CHUNG theo từng kỳ thi (Người tạo đề đặt khi tạo/sửa đề xuất).
     * - true : phòng ban thiếu câu riêng thì bù bằng câu chung (hành vi cũ); mọi vai trò đều chọn được.
     * - false: KHÔNG bù; phòng ban chưa đủ departmentQuestionCount câu riêng bị khóa, không được chọn làm vai trò thi.
     * CỐ TÌNH KHÔNG đặt default: kỳ thi cũ (chưa có field) được code coi là đang BẬT bù để giữ nguyên hành vi trước đây
     * (xem isCommonCompensationEnabled trong exam-code-generation.service.js) -> không cần migrate dữ liệu cũ.
     * Kỳ thi tạo mới luôn được service ghi giá trị rõ ràng (mặc định false). Không đổi được sau khi kỳ thi đã công bố.
     */
    allowCommonCompensation: { type: Boolean },
    /**
     * MỚI — Phạm vi phòng ban được phép tham gia kỳ thi (allowed departments).
     * - all     : Tất cả phòng ban đều được thi (mặc định cho kỳ thi mới).
     * - selected: Chỉ các phòng ban trong danh sách allowedDepartmentIds được thi.
     * CỐ TÌNH KHÔNG đặt default: kỳ thi cũ (chưa có field) được code coi là 'all' để tương thích ngược.
     */
    departmentScope: {
      type: String,
      enum: ['all', 'selected'],
    },
    /**
     * Danh sách ID phòng ban được thi khi departmentScope = 'selected'.
     * BẮT BUỘC default: undefined để tránh Mongoose tự gán [] khiến kỳ thi cũ bị hiểu nhầm thành không phòng nào được thi.
     */
    allowedDepartmentIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
      default: undefined,
    },
    status: {
      type: String,
      enum: Object.values(EXAM_STATUS),
      default: EXAM_STATUS.DRAFT,
      index: true,
    },
    /**
     * Assumption nhóm nghiên cứu (BRS Bước 7 #1) — % câu đúng tối thiểu để đạt.
     * Cấu hình theo kỳ thi trên Exam, không đặt trong env.
     */
    passThresholdPercent: { type: Number, min: 0, max: 100, default: 70 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    publishedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
    /**
     * MỚI — Khóa "đang phát hành": đặt nguyên tử khi một Người duyệt đề bắt đầu publishExam, gỡ khi phát hành xong hoặc lỗi.
     * Chặn 2 người cùng đăng một kỳ thi (sinh trùng mã đề) và chặn Lưu trữ (archive) chen ngang lúc đang phát hành.
     * Khóa quá hạn (PUBLISH_LOCK_TTL_MS trong exam.service.js) được coi là đã hết hiệu lực, phòng khi server sập giữa chừng.
     */
    publishLockedAt: { type: Date },
  },
  // optimisticConcurrency: save() kèm điều kiện __v; nếu đề đã bị thao tác khác sửa/chuyển trạng thái trong lúc đang
  // xử lý thì ném VersionError thay vì ghi đè lặng lẽ. Mọi cập nhật nguyên tử trong exam.service.js đều $inc __v để khớp.
  { timestamps: true, optimisticConcurrency: true },
);

// MỚI — Tối đa MỘT kỳ thi ở trạng thái published tại mọi thời điểm (chốt chặn ở tầng DB, chống 2 kỳ thi được đăng đồng thời).
// Tên index đặt riêng để không đụng index `status_1` mặc định. LƯU Ý: nếu dữ liệu hiện tại đã có >1 kỳ thi published thì
// Mongo sẽ không tạo được index này (app vẫn chạy, chỉ log lỗi) — xem hướng dẫn kiểm tra trước khi triển khai.
examSchema.index(
  { status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: EXAM_STATUS.PUBLISHED },
    name: 'uniq_single_published_exam',
  },
);

examSchema.pre('validate', function validateQuestionCounts(next) {
  const sum = (this.commonQuestionCount ?? 0) + (this.departmentQuestionCount ?? 0);
  if (this.totalQuestions != null && sum !== this.totalQuestions) {
    next(
      new Error(
        'commonQuestionCount + departmentQuestionCount must equal totalQuestions',
      ),
    );
    return;
  }
  next();
});

export const Exam = mongoose.model('Exam', examSchema);
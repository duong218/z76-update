import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
      index: true,
    },
    plannedDate: { type: Date, required: true },
    note: { type: String, trim: true },
  },
  { timestamps: true },
);

export const Schedule = mongoose.model('Schedule', scheduleSchema);

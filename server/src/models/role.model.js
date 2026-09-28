import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Mã ổn định cho middleware (vd admin, examiner, candidate, leader) — lưu DB, không enum cứng app-wide */
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Role = mongoose.model('Role', roleSchema);

/**
 * Service Sinh Mã Đề & Gán Đề Thi cho Thí Sinh (Exam Code Generation Service).
 * Thuật toán sinh đề thi riêng biệt cho từng thí sinh (kết hợp câu hỏi chung và câu hỏi riêng theo phòng ban) và cơ chế bù trừ câu hỏi thông minh.
 */

import crypto from 'node:crypto';
import {
  Department,
  Employee,
  Question,
  ExamCode,
  ExamCodeQuestion,
  ExamCandidate,
  Exam,
  EXAM_STATUS,
  QUESTION_SCOPE,
} from '../models/index.js';
import { ApiError } from '../utils/api-error.js';
import { notificationService } from './notification.service.js';

// Thuật toán xáo trộn mảng ngẫu nhiên Fisher–Yates
function shuffle(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Lấy ngẫu nhiên N phần tử từ mảng
function pickRandom(arr, count) {
  return shuffle(arr).slice(0, count);
}

// Tính mã băm SHA-256 đại diện cho tập hợp câu hỏi (Fingerprint)
function computeFingerprint(questionIds) {
  const sorted = [...questionIds].map(String).sort();
  return crypto.createHash('sha256').update(sorted.join(',')).digest('hex');
}

// Xây dựng chuỗi mã đề duy nhất cho từng thí sinh (Mã kỳ thi - Mã phòng ban - Mã NV - Random Suffix)
function buildExamCode(exam, department, employee) {
  const deptSuffix = (department.code || department.name).replace(/\s+/g, '').toUpperCase().slice(0, 8);
  const empSuffix = (employee.employeeCode || 'NV').replace(/\s+/g, '').toUpperCase().slice(0, 8);
  const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${exam._id.toString().slice(-6).toUpperCase()}-${deptSuffix}-${empSuffix}-${randomSuffix}`;
}

// Kiểm tra số lượng câu hỏi khả dụng và lập phương án rút câu (tự động bù từ câu chung nếu câu riêng phòng ban bị thiếu)
async function validateQuestionAvailability(exam, department) {
  const commonQuestions = await Question.find({
    topicId: exam.topicId,
    scope: QUESTION_SCOPE.COMMON,
    isActive: true,
  });

  const deptQuestions = await Question.find({
    topicId: exam.topicId,
    scope: QUESTION_SCOPE.DEPARTMENT_SPECIFIC,
    departmentId: department._id,
    isActive: true,
  });

  const totalNeeded = exam.commonQuestionCount + exam.departmentQuestionCount;
  const deptPickCount = Math.min(deptQuestions.length, exam.departmentQuestionCount);
  const shortfall = exam.departmentQuestionCount - deptPickCount;
  const commonPickCount = exam.commonQuestionCount + shortfall;

  if (commonQuestions.length < commonPickCount) {
    const totalAvailable = commonQuestions.length + deptQuestions.length;
    throw new ApiError(
      400,
      `Phòng ban "${department.name}" không đủ câu hỏi để tạo đề (cần tổng ${totalNeeded} câu, ` +
        `hiện có ${commonQuestions.length} câu chung + ${deptQuestions.length} câu riêng = ${totalAvailable} câu). ` +
        `Vui lòng bổ sung thêm câu hỏi (chung hoặc riêng cho phòng ban này) thuộc chủ đề đã chọn.`,
      'INSUFFICIENT_QUESTIONS',
    );
  }

  return {
    commonQuestions,
    deptQuestions,
    plan: { commonPickCount, deptPickCount, shortfall },
  };
}

// Rút ngẫu nhiên câu hỏi và tạo bản ghi ExamCode + ExamCodeQuestion riêng biệt cho 1 nhân viên
async function createExamCodeForEmployee(exam, department, employee, commonQuestions, deptQuestions, plan) {
  const commonPick = pickRandom(commonQuestions, plan.commonPickCount);
  const deptPick = pickRandom(deptQuestions, plan.deptPickCount);
  const allQuestions = shuffle([...commonPick, ...deptPick]);

  const examCode = await ExamCode.create({
    examId: exam._id,
    code: buildExamCode(exam, department, employee),
    departmentId: department._id,
    questionSetFingerprint: computeFingerprint(allQuestions.map((q) => q._id)),
  });

  const examCodeQuestionDocs = allQuestions.map((q, index) => ({
    examCodeId: examCode._id,
    questionId: q._id,
    orderIndex: index,
  }));
  await ExamCodeQuestion.insertMany(examCodeQuestionDocs);

  return examCode;
}

// Đảm bảo tạo thành công mã đề thi riêng cho nhân viên (có cơ chế thử lại nếu bị trùng mã ngẫu nhiên)
async function ensureExamCodeForEmployee(exam, department, employee, precomputedPool) {
  const { commonQuestions, deptQuestions, plan } =
    precomputedPool ?? (await validateQuestionAvailability(exam, department));

  try {
    return await createExamCodeForEmployee(exam, department, employee, commonQuestions, deptQuestions, plan);
  } catch (err) {
    if (err?.code === 11000) {
      return createExamCodeForEmployee(exam, department, employee, commonQuestions, deptQuestions, plan);
    }
    throw err;
  }
}

// Sinh mã đề và gán đề cho TOÀN BỘ nhân viên khi công bố kỳ thi (Publish)
export async function generateExamCodesAndAssignCandidates(exam) {
  const employees = await Employee.find({ isActive: true }).select('_id employeeCode departmentId');
  const employeesByDept = new Map();
  for (const emp of employees) {
    const key = emp.departmentId.toString();
    if (!employeesByDept.has(key)) employeesByDept.set(key, []);
    employeesByDept.get(key).push(emp);
  }

  if (employeesByDept.size === 0) {
    throw new ApiError(400, 'Không có nhân viên nào đang hoạt động để gán đề thi', 'NO_ACTIVE_EMPLOYEES');
  }

  const departments = await Department.find({
    isActive: true,
    _id: { $in: [...employeesByDept.keys()] },
  });

  // Kiểm tra tính sẵn sàng của ngân hàng câu hỏi cho từng phòng ban
  const pools = new Map();
  for (const dept of departments) {
    const { commonQuestions, deptQuestions, plan } = await validateQuestionAvailability(exam, dept);
    pools.set(dept._id.toString(), { commonQuestions, deptQuestions, plan });
  }

  // Tạo đề và gán thí sinh độc lập cho từng nhân viên
  for (const dept of departments) {
    const deptKey = dept._id.toString();
    const deptEmployees = employeesByDept.get(deptKey) || [];
    if (deptEmployees.length === 0) continue;

    const existingCandidates = await ExamCandidate.find({
      examId: exam._id,
      employeeId: { $in: deptEmployees.map((e) => e._id) },
    }).select('employeeId');
    const alreadyAssignedIds = new Set(existingCandidates.map((c) => c.employeeId.toString()));

    const pendingEmployees = deptEmployees.filter((emp) => !alreadyAssignedIds.has(emp._id.toString()));
    if (pendingEmployees.length === 0) continue;

    const pool = pools.get(deptKey);

    for (const employee of pendingEmployees) {
      const examCode = await ensureExamCodeForEmployee(exam, dept, employee, pool);
      await ExamCandidate.create({
        examId: exam._id,
        employeeId: employee._id,
        examCodeId: examCode._id,
      });
    }
  }
}

// Tự động gán đề cho nhân viên mới vào kỳ thi đang phát hành (nếu có)
export async function assignEmployeeToActiveExamIfAny(employee) {
  let exam;
  let department;
  try {
    exam = await Exam.findOne({ status: EXAM_STATUS.PUBLISHED });
    if (!exam) return null;

    const alreadyAssigned = await ExamCandidate.findOne({ examId: exam._id, employeeId: employee._id });
    if (alreadyAssigned) return alreadyAssigned;

    department = await Department.findById(employee.departmentId);
    if (!department || !department.isActive) return null;

    const examCode = await ensureExamCodeForEmployee(exam, department, employee);

    return await ExamCandidate.create({
      examId: exam._id,
      employeeId: employee._id,
      examCodeId: examCode._id,
    });
  } catch (err) {
    console.error(
      `[exam-code-generation] Không thể tự động gán đề thi cho nhân viên ${employee._id}: ${err.message}`,
    );

    if (exam) {
      try {
        await notificationService.notifyExamAssignmentFailed({
          exam,
          employee,
          department,
          reason: err.message,
        });
      } catch (notifyErr) {
        console.error('notifyExamAssignmentFailed failed:', notifyErr);
      }
    }

    return null;
  }
}
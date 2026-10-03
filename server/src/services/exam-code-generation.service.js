/**
 * Service Sinh Mã Đề & Gán Đề Thi cho Thí Sinh (Exam Code Generation Service).
 * Thuật toán sinh đề thi riêng biệt cho từng thí sinh (kết hợp câu hỏi chung và câu hỏi riêng theo phòng ban) và cơ chế bù trừ câu hỏi thông minh.
 * MỚI — Hỗ trợ nhân viên KIÊM NHIỆM: lúc publish mỗi người nhận mã đề mặc định theo PHÒNG CHÍNH (nếu phòng chính không còn hoạt động
 * thì tự chuyển sang phòng kiêm nhiệm đầu tiên còn hoạt động); khi thí sinh chọn vai trò khác (hoặc Người duyệt đề chọn lại khi cấp
 * thêm lượt) thì đổi sang mã đề của phòng được chọn (assignCandidateRole).
 * MỚI — Công tắc BÙ CÂU CHUNG theo từng kỳ thi (exam.allowCommonCompensation):
 *  - BẬT  : phòng thiếu câu riêng thì bù bằng câu chung (hành vi cũ), mọi vai trò đều "đủ điều kiện".
 *  - TẮT  : KHÔNG bù. Phòng có số câu riêng < departmentQuestionCount bị coi là KHÔNG đủ điều kiện (eligible = false):
 *           không được chọn làm vai trò thi, không được gán làm mã đề mặc định (chống kiêm nhiệm cố ý chọn phòng
 *           không có câu riêng để nhận đề toàn câu chung dễ hơn).
 *  Kỳ thi cũ (chưa có field này) coi như đang BẬT bù để giữ nguyên hành vi trước đây.
 */

import crypto from 'node:crypto';
import mongoose from 'mongoose';
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
import { QUESTION_USAGE } from '../models/constants.js';
import { questionUsageFilter } from '../models/question.model.js';
import { getEmployeeDepartmentIds } from '../models/employee.model.js';
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

// MỚI — Kỳ thi có cho phép BÙ câu chung khi phòng thiếu câu riêng không?
// Chỉ khi cờ được đặt rõ ràng là false mới là chế độ nghiêm ngặt; kỳ thi cũ chưa có field (undefined) giữ hành vi bù như trước.
export function isCommonCompensationEnabled(exam) {
  return exam?.allowCommonCompensation !== false;
}

// MỚI — Phạm vi phòng ban được thi (đọc phòng thủ vì listExams / .lean() không áp default Mongoose).
export function resolveDepartmentScope(exam) {
  const mode = exam?.departmentScope === 'selected' ? 'selected' : 'all';
  const ids = new Set();
  if (mode === 'selected' && Array.isArray(exam?.allowedDepartmentIds)) {
    for (const raw of exam.allowedDepartmentIds) {
      const key = raw?._id ? String(raw._id) : String(raw);
      if (key && key !== 'undefined') ids.add(key);
    }
  }
  return { mode, ids };
}

export function isDepartmentInScope(exam, departmentId) {
  const { mode, ids } = resolveDepartmentScope(exam);
  if (mode === 'all') return true;
  return ids.has(String(departmentId));
}

// MỚI — Đếm số câu riêng (ngân hàng THI CHÍNH THỨC) của 1 phòng ban thuộc chủ đề của kỳ thi, và xét phòng đó có đủ điều kiện
// làm vai trò thi hay không. eligible = trong phạm vi AND (bật bù OR đủ câu riêng).
async function resolveDepartmentEligibility(exam, departmentId) {
  const inScope = isDepartmentInScope(exam, departmentId);
  const deptQuestionCount = await Question.countDocuments({
    topicId: exam.topicId,
    scope: QUESTION_SCOPE.DEPARTMENT_SPECIFIC,
    departmentId,
    isActive: true,
    ...questionUsageFilter(QUESTION_USAGE.EXAM),
  });
  const requiredDeptQuestions = exam.departmentQuestionCount ?? 0;
  const meetsQuestionRule =
    requiredDeptQuestions === 0 || isCommonCompensationEnabled(exam) || deptQuestionCount >= requiredDeptQuestions;
  const eligible = inScope && meetsQuestionRule;
  let reason = null;
  if (!inScope) reason = 'out_of_scope';
  else if (!meetsQuestionRule) reason = 'insufficient_questions';
  return { eligible, inScope, deptQuestionCount, requiredDeptQuestions, reason };
}

// Kiểm tra số lượng câu hỏi khả dụng và lập phương án rút câu.
// - Bật bù: tự động bù từ câu chung nếu câu riêng phòng ban bị thiếu (eligible luôn = true).
// - Tắt bù: KHÔNG bù; phòng thiếu câu riêng -> eligible = false (không ném lỗi ở đây, để nơi gọi quyết định); chỉ ném
//   INSUFFICIENT_QUESTIONS khi thiếu câu CHUNG.
// extraOnly = true: phòng ban này chỉ xuất hiện ở nhân viên KIÊM NHIỆM (chưa ai lấy làm phòng chính) — chỉ để làm rõ thông báo lỗi.
async function validateQuestionAvailability(exam, department, { extraOnly = false } = {}) {
  const inScope = isDepartmentInScope(exam, department._id);
  if (!inScope) {
    const requiredDeptQuestions = exam.departmentQuestionCount ?? 0;
    return {
      eligible: false,
      inScope: false,
      deptQuestionCount: 0,
      requiredDeptQuestions,
      commonQuestions: [],
      deptQuestions: [],
      plan: { commonPickCount: 0, deptPickCount: 0, shortfall: 0 },
    };
  }

  const commonQuestions = await Question.find({
    topicId: exam.topicId,
    scope: QUESTION_SCOPE.COMMON,
    isActive: true,
    // Chỉ rút từ ngân hàng THI CHÍNH THỨC, không bao giờ rút câu ôn tập (thí sinh đã thấy đáp án)
    ...questionUsageFilter(QUESTION_USAGE.EXAM),
  });

  const deptQuestions = await Question.find({
    topicId: exam.topicId,
    scope: QUESTION_SCOPE.DEPARTMENT_SPECIFIC,
    departmentId: department._id,
    isActive: true,
    ...questionUsageFilter(QUESTION_USAGE.EXAM),
  });

  const totalNeeded = exam.commonQuestionCount + exam.departmentQuestionCount;
  const requiredDeptQuestions = exam.departmentQuestionCount;
  const compensate = isCommonCompensationEnabled(exam);

  // Tắt bù: không bù -> phần thiếu (shortfall) luôn = 0, phòng thiếu câu riêng sẽ bị đánh dấu không đủ điều kiện
  const deptPickCount = Math.min(deptQuestions.length, requiredDeptQuestions);
  const shortfall = compensate ? requiredDeptQuestions - deptPickCount : 0;
  const commonPickCount = exam.commonQuestionCount + shortfall;
  const eligible = compensate || requiredDeptQuestions === 0 || deptQuestions.length >= requiredDeptQuestions;

  if (commonQuestions.length < commonPickCount) {
    const totalAvailable = commonQuestions.length + deptQuestions.length;
    throw new ApiError(
      400,
      `Phòng ban "${department.name}" không đủ câu hỏi để tạo đề (cần tổng ${totalNeeded} câu, ` +
        `hiện có ${commonQuestions.length} câu chung + ${deptQuestions.length} câu riêng = ${totalAvailable} câu). ` +
        (extraOnly
          ? 'Phòng ban này hiện chỉ có nhân viên KIÊM NHIỆM nhưng vẫn cần đủ câu hỏi để họ chọn vai trò này khi thi. '
          : '') +
        `Vui lòng bổ sung thêm câu hỏi thi chính thức (chung hoặc riêng cho phòng ban này) thuộc chủ đề đã chọn. ` +
        `Lưu ý: câu hỏi thuộc ngân hàng Ôn tập không được tính vào đề thi.`,
      'INSUFFICIENT_QUESTIONS',
    );
  }

  return {
    eligible,
    inScope: true,
    deptQuestionCount: deptQuestions.length,
    requiredDeptQuestions,
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
  const { eligible, deptQuestionCount, requiredDeptQuestions, commonQuestions, deptQuestions, plan } =
    precomputedPool ?? (await validateQuestionAvailability(exam, department));

  // MỚI — Tắt bù: phòng chưa đủ câu riêng thì không được phép sinh mã đề (chặn lách luật chọn phòng không có câu riêng)
  if (!eligible) {
    throw new ApiError(
      400,
      `Kỳ thi này không dành cho phòng ban "${department.name}" (chưa đủ câu hỏi riêng: ${deptQuestionCount}/${requiredDeptQuestions} câu, ` +
        'kỳ thi không bật chế độ bù câu chung) nên không thể thi với tư cách phòng ban này.',
      'ROLE_NOT_ELIGIBLE',
    );
  }

  try {
    return await createExamCodeForEmployee(exam, department, employee, commonQuestions, deptQuestions, plan);
  } catch (err) {
    if (err?.code === 11000) {
      return createExamCodeForEmployee(exam, department, employee, commonQuestions, deptQuestions, plan);
    }
    throw err;
  }
}

// MỚI — Phân tích kỳ thi theo từng phòng ban / nhân viên (KHÔNG ghi gì vào DB): tính eligible của từng phòng, gom nhân viên theo
// phòng ban MẶC ĐỊNH (phòng đầu tiên còn hoạt động và đủ điều kiện) và tìm các nhân viên bị CHẶN (không phòng nào đủ điều kiện,
// chỉ xảy ra khi kỳ thi TẮT bù câu chung). Dùng chung cho bước kiểm tra sớm lúc gửi duyệt và bước sinh đề lúc công bố.
async function analyzeExamRoles(exam, employees) {
  // Tập mọi phòng ban có thể được chọn làm vai trò thi = phòng chính ∪ phòng kiêm nhiệm của các nhân viên đang hoạt động
  const mainDeptKeys = new Set();
  const allDeptKeys = new Set();
  for (const emp of employees) {
    mainDeptKeys.add(String(emp.departmentId));
    for (const id of getEmployeeDepartmentIds(emp)) allDeptKeys.add(id);
  }

  const departments = await Department.find({
    isActive: true,
    _id: { $in: [...allDeptKeys] },
  });
  const activeDeptKeys = new Set(departments.map((d) => d._id.toString()));
  const deptNameByKey = new Map(departments.map((d) => [d._id.toString(), d.name]));

  // Kiểm tra tính sẵn sàng của ngân hàng câu hỏi cho từng phòng ban (kể cả phòng chỉ có người kiêm nhiệm).
  // Bật bù: eligible luôn true. Tắt bù: phòng thiếu câu riêng -> eligible = false (vẫn chạy tiếp, xử lý ở bước gom nhân viên).
  const pools = new Map();
  for (const dept of departments) {
    const deptKey = dept._id.toString();
    const pool = await validateQuestionAvailability(exam, dept, {
      extraOnly: !mainDeptKeys.has(deptKey),
    });
    pools.set(deptKey, pool);
  }

  // Gom nhân viên theo phòng ban MẶC ĐỊNH: phòng đầu tiên (chính rồi kiêm nhiệm) vừa còn hoạt động vừa eligible (trong phạm vi + đủ câu/bù).
  // Nhân viên không có phòng eligible -> ngoài phạm vi kỳ thi (không chặn gửi duyệt), chỉ cảnh báo.
  const employeesByDept = new Map();
  const outOfScopeByDept = new Map();
  let outOfScopeEmployeeCount = 0;
  for (const emp of employees) {
    const activeKeys = getEmployeeDepartmentIds(emp).filter((id) => activeDeptKeys.has(id));
    if (activeKeys.length === 0) continue;

    const defaultKey = activeKeys.find((id) => pools.get(id)?.eligible);
    if (!defaultKey) {
      outOfScopeEmployeeCount += 1;
      const mainKey = emp.departmentId ? String(emp.departmentId) : activeKeys[0];
      outOfScopeByDept.set(mainKey, (outOfScopeByDept.get(mainKey) ?? 0) + 1);
      continue;
    }
    if (!employeesByDept.has(defaultKey)) employeesByDept.set(defaultKey, []);
    employeesByDept.get(defaultKey).push(emp);
  }

  const { mode, ids } = resolveDepartmentScope(exam);
  let selectedZeroEmployeeDeptNames = [];
  if (mode === 'selected' && ids.size > 0) {
    const empCountByDept = new Map();
    for (const emp of employees) {
      for (const id of getEmployeeDepartmentIds(emp)) {
        empCountByDept.set(id, (empCountByDept.get(id) || 0) + 1);
      }
    }
    const scopeDeptDocs = await Department.find({ _id: { $in: [...ids] }, isActive: true })
      .select('name')
      .lean();
    const scopeNameByKey = new Map(scopeDeptDocs.map((d) => [d._id.toString(), d.name]));
    for (const id of ids) {
      if ((empCountByDept.get(id) || 0) === 0) {
        selectedZeroEmployeeDeptNames.push(scopeNameByKey.get(id) || id);
      }
    }
  }

  return {
    departments,
    pools,
    employeesByDept,
    outOfScopeEmployeeCount,
    outOfScopeByDept,
    deptNameByKey,
    selectedZeroEmployeeDeptNames,
  };
}

// MỚI — Cảnh báo (không chặn) khi có nhân viên ngoài phạm vi kỳ thi.
export function buildScopeWarnings(analysis) {
  const { outOfScopeEmployeeCount, outOfScopeByDept, deptNameByKey } = analysis;
  if (!outOfScopeEmployeeCount) return null;
  return {
    outOfScopeEmployeeCount,
    outOfScopeDepartments: [...outOfScopeByDept.entries()].map(([departmentId, employeeCount]) => ({
      departmentId,
      name: deptNameByKey.get(departmentId) ?? departmentId,
      employeeCount,
    })),
  };
}

function countInScopeEmployees(analysis) {
  let total = 0;
  for (const arr of analysis.employeesByDept.values()) total += arr.length;
  return total;
}

function buildNoEligibleCandidatesError(exam, analysis) {
  let message =
    'Không có nhân viên nào thuộc phạm vi kỳ thi này. Vui lòng điều chỉnh phạm vi phòng ban hoặc bổ sung câu hỏi.';
  const zeroNames = analysis.selectedZeroEmployeeDeptNames ?? [];
  if (zeroNames.length > 0) {
    message += ` Gợi ý: bỏ chọn các phòng ban không có nhân viên (${zeroNames.join(', ')}) nếu phạm vi hiện chỉ gồm các phòng đó.`;
  }
  return new ApiError(400, message, 'NO_ELIGIBLE_CANDIDATES');
}

// MỚI — Kiểm tra phòng TRONG PHẠM VI đủ câu riêng khi TẮT bù (gọi lúc lưu đề xuất + gửi duyệt + công bố).
export async function assertScopeQuestionsSufficient({
  topicId,
  departmentQuestionCount,
  allowCommonCompensation,
  departmentScope,
  allowedDepartmentIds,
}) {
  if (allowCommonCompensation !== false) return;
  const required = departmentQuestionCount ?? 0;
  if (required === 0) return;

  if (!mongoose.isValidObjectId(topicId)) {
    throw new ApiError(400, 'topicId không hợp lệ', 'QUESTION_STATS_INVALID_TOPIC');
  }

  const examLike = {
    departmentScope,
    allowedDepartmentIds,
    allowCommonCompensation,
    topicId,
    departmentQuestionCount: required,
  };

  const [deptCountsRaw, departments, employees] = await Promise.all([
    Question.aggregate([
      {
        $match: {
          topicId: new mongoose.Types.ObjectId(topicId),
          scope: QUESTION_SCOPE.DEPARTMENT_SPECIFIC,
          isActive: true,
          ...questionUsageFilter(QUESTION_USAGE.EXAM),
        },
      },
      { $group: { _id: '$departmentId', count: { $sum: 1 } } },
    ]),
    Department.find({ isActive: true }).sort({ name: 1 }).lean(),
    Employee.find({ isActive: true }).select('departmentId extraDepartmentIds').lean(),
  ]);

  const countByDeptId = new Map(deptCountsRaw.map((d) => [d._id.toString(), d.count]));
  const employeeCountByDeptId = new Map();
  for (const emp of employees) {
    for (const id of getEmployeeDepartmentIds(emp)) {
      employeeCountByDeptId.set(id, (employeeCountByDeptId.get(id) || 0) + 1);
    }
  }

  const { mode, ids } = resolveDepartmentScope(examLike);
  const departmentsToCheck = [];
  if (mode === 'selected') {
    for (const dept of departments) {
      const key = dept._id.toString();
      if (ids.has(key)) departmentsToCheck.push(dept);
    }
  } else {
    for (const dept of departments) {
      const key = dept._id.toString();
      if ((employeeCountByDeptId.get(key) || 0) > 0) departmentsToCheck.push(dept);
    }
  }

  const insufficient = [];
  for (const dept of departmentsToCheck) {
    const key = dept._id.toString();
    const count = countByDeptId.get(key) ?? 0;
    if (count < required) {
      insufficient.push({ name: dept.name, count, required });
    }
  }

  if (insufficient.length === 0) return;

  const detail = insufficient.map((d) => `"${d.name}" (${d.count}/${d.required} câu riêng)`).join('; ');
  throw new ApiError(
    400,
    `Không thể lưu: các phòng ban trong phạm vi thi chưa đủ câu hỏi riêng (kỳ thi đang TẮT bù câu chung): ${detail}. ` +
      'Vui lòng bổ sung câu hỏi riêng, bật bù câu chung, hoặc điều chỉnh phạm vi phòng ban.',
    'SCOPE_DEPARTMENT_INSUFFICIENT_QUESTIONS',
  );
}

// Kiểm tra sớm trước gửi duyệt / công bố. Trả về object cảnh báo phạm vi (hoặc null).
export async function assertExamPublishable(exam) {
  await assertScopeQuestionsSufficient({
    topicId: exam.topicId,
    departmentQuestionCount: exam.departmentQuestionCount,
    allowCommonCompensation: exam.allowCommonCompensation,
    departmentScope: exam.departmentScope,
    allowedDepartmentIds: exam.allowedDepartmentIds,
  });

  const employees = await Employee.find({ isActive: true }).select(
    '_id employeeCode departmentId extraDepartmentIds',
  );
  if (employees.length === 0) {
    throw buildNoEligibleCandidatesError(exam, { selectedZeroEmployeeDeptNames: [] });
  }

  const analysis = await analyzeExamRoles(exam, employees);
  if (countInScopeEmployees(analysis) === 0) {
    throw buildNoEligibleCandidatesError(exam, analysis);
  }

  return buildScopeWarnings(analysis);
}

// Sinh mã đề và gán đề cho TOÀN BỘ nhân viên khi công bố kỳ thi (Publish)
// Mã đề mặc định của mỗi nhân viên theo PHÒNG CHÍNH (phòng chính ngừng hoạt động -> phòng kiêm nhiệm đầu tiên còn hoạt động).
// Bước kiểm tra ngân hàng câu hỏi được làm cho cả các phòng KIÊM NHIỆM, để lúc thí sinh chọn vai trò kiêm nhiệm không bị báo
// thiếu câu hỏi (lỗi phải bị chặn ngay từ lúc publish).
export async function generateExamCodesAndAssignCandidates(exam) {
  const employees = await Employee.find({ isActive: true }).select(
    '_id employeeCode departmentId extraDepartmentIds',
  );

  if (employees.length === 0) {
    throw new ApiError(400, 'Không có nhân viên nào đang hoạt động để gán đề thi', 'NO_ACTIVE_EMPLOYEES');
  }

  await assertScopeQuestionsSufficient({
    topicId: exam.topicId,
    departmentQuestionCount: exam.departmentQuestionCount,
    allowCommonCompensation: exam.allowCommonCompensation,
    departmentScope: exam.departmentScope,
    allowedDepartmentIds: exam.allowedDepartmentIds,
  });

  const analysis = await analyzeExamRoles(exam, employees);
  if (countInScopeEmployees(analysis) === 0) {
    throw buildNoEligibleCandidatesError(exam, analysis);
  }

  const { departments, employeesByDept, pools } = analysis;

  // Tạo đề và gán thí sinh độc lập cho từng nhân viên (theo phòng ban mặc định của họ)
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

// MỚI — Danh sách vai trò (phòng ban đang hoạt động) mà nhân viên có thể chọn để thi: phòng chính đứng đầu, rồi các phòng kiêm nhiệm.
// Trả về [{ departmentId, name, code, isMain, isDefault }]. Phòng ban đã ngừng hoạt động (xóa mềm) bị loại.
// - Không truyền exam: giữ hành vi cũ (eligible = true, isDefault = vai trò đầu tiên).
// - Có truyền exam: mỗi option có thêm eligible, deptQuestionCount, requiredDeptQuestions; isDefault = option ĐỦ ĐIỀU KIỆN đầu tiên
//   (không có option nào đủ điều kiện thì không option nào là mặc định).
export async function getEmployeeRoleOptions(employee, exam = null) {
  const ids = getEmployeeDepartmentIds(employee);
  if (ids.length === 0) return [];

  const departments = await Department.find({ isActive: true, _id: { $in: ids } });
  const byId = new Map(departments.map((d) => [d._id.toString(), d]));
  const mainKey = employee.departmentId ? String(employee.departmentId?._id ?? employee.departmentId) : '';

  const options = ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((d) => ({
      departmentId: d._id,
      name: d.name,
      code: d.code ?? null,
      isMain: d._id.toString() === mainKey,
      isDefault: false,
      eligible: true,
    }));

  if (exam) {
    for (const option of options) {
      const stats = await resolveDepartmentEligibility(exam, option.departmentId);
      option.eligible = stats.eligible;
      option.inScope = stats.inScope;
      option.reason = stats.reason;
      option.deptQuestionCount = stats.deptQuestionCount;
      option.requiredDeptQuestions = stats.requiredDeptQuestions;
    }
  }

  const defaultOption = options.find((o) => o.eligible);
  if (defaultOption) defaultOption.isDefault = true;
  return options;
}

// MỚI — Đổi vai trò (phòng ban) của 1 thí sinh trong kỳ thi: sinh mã đề mới theo phòng được chọn, gắn lại vào ExamCandidate
// rồi dọn mã đề cũ. Hàm KHÔNG kiểm tra quyền/khóa vai trò (việc đó thuộc exam-attempt.service.js: thí sinh chỉ được chọn lần đầu,
// Người duyệt đề mới được đổi lại) — nhưng luôn chặn phòng ban ngoài tập phòng chính ∪ kiêm nhiệm của nhân viên.
// Nếu phòng được chọn trùng với phòng của mã đề hiện tại thì giữ nguyên mã đề (changed = false).
export async function assignCandidateRole({ exam, examCandidate, employee, departmentId }) {
  const targetKey = String(departmentId ?? '');
  const allowed = getEmployeeDepartmentIds(employee);
  if (!targetKey || !allowed.includes(targetKey)) {
    throw new ApiError(
      400,
      'Vai trò (phòng ban) được chọn không thuộc phòng chính hoặc phòng kiêm nhiệm của nhân viên này',
      'ROLE_INVALID',
    );
  }

  const department = await Department.findById(departmentId);
  if (!department || !department.isActive) {
    throw new ApiError(400, 'Phòng ban được chọn không tồn tại hoặc đã ngừng hoạt động', 'ROLE_INVALID');
  }

  // MỚI — Kiểm tra phòng được chọn có ĐỦ ĐIỀU KIỆN (đủ câu riêng, hoặc kỳ thi bật bù) TRƯỚC khi giữ nguyên mã đề cũ
  const stats = await resolveDepartmentEligibility(exam, department._id);
  if (!stats.eligible) {
    const message =
      stats.reason === 'out_of_scope'
        ? `Phòng ban "${department.name}" không thuộc phạm vi được thi của kỳ thi này.`
        : `Kỳ thi này không dành cho phòng ban "${department.name}" (chưa đủ câu hỏi riêng: ${stats.deptQuestionCount}/${stats.requiredDeptQuestions} câu) ` +
          'nên không thể chọn làm vai trò thi.';
    throw new ApiError(400, message, 'ROLE_NOT_ELIGIBLE');
  }

  const currentCode = await ExamCode.findById(examCandidate.examCodeId);
  if (currentCode && currentCode.departmentId.toString() === targetKey) {
    return { examCandidate, examCode: currentCode, changed: false };
  }

  // Sinh mã đề mới TRƯỚC (có kiểm tra đủ câu hỏi), chỉ khi thành công mới đổi liên kết và dọn mã cũ
  const newCode = await ensureExamCodeForEmployee(exam, department, employee);
  const oldCodeId = examCandidate.examCodeId;

  try {
    examCandidate.examCodeId = newCode._id;
    await examCandidate.save();
  } catch (err) {
    examCandidate.examCodeId = oldCodeId;
    await ExamCodeQuestion.deleteMany({ examCodeId: newCode._id }).catch(() => {});
    await ExamCode.deleteOne({ _id: newCode._id }).catch(() => {});
    throw err;
  }

  try {
    await ExamCodeQuestion.deleteMany({ examCodeId: oldCodeId });
    await ExamCode.deleteOne({ _id: oldCodeId });
  } catch (cleanupErr) {
    console.error(`[exam-code-generation] Không dọn được mã đề cũ ${oldCodeId}: ${cleanupErr.message}`);
  }

  return { examCandidate, examCode: newCode, changed: true };
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

    // Phòng mặc định = phòng đầu tiên (chính rồi kiêm nhiệm) vừa còn hoạt động vừa ĐỦ ĐIỀU KIỆN
    const roleOptions = await getEmployeeRoleOptions(employee, exam);
    if (roleOptions.length === 0) return null;
    const defaultOption = roleOptions.find((o) => o.isDefault);
    if (!defaultOption) {
      // MỚI — Ngoài phạm vi kỳ thi: im lặng, không báo lỗi gán đề.
      if (roleOptions.length === 0 || roleOptions.every((o) => o.inScope === false)) {
        return null;
      }
      throw new ApiError(
        400,
        'Kỳ thi này không dành cho phòng ban nào của nhân viên (kỳ thi đang tắt chế độ bù câu chung).',
        'NO_ELIGIBLE_ROLE',
      );
    }
    department = await Department.findById(defaultOption.departmentId);
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
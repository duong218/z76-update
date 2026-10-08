// Test phân tích câu hỏi và bản đồ năng lực bằng DỮ LIỆU GIẢ LẬP (không dùng dữ liệu thật).
// Chạy trong thư mục server: node test-analytics.mjs   (đổi SERVER thành đường dẫn tới server/src nếu cần)
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const SERVER = pathToFileURL(process.env.SERVER_SRC || path.resolve('src')).href; // Windows cần dạng file:///D:/...
const M = await import(`${SERVER}/models/index.js`);
const { PracticeSession } = await import(`${SERVER}/models/practice-session.model.js`);
const svc = await import(`${SERVER}/services/analytics.service.js`);

let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  -> ' + extra : '')); };

// ───────────── 1) Phân tích câu hỏi (hàm thuần) ─────────────
// 40 lượt thi, điểm tổng giảm dần 100..61. rank 0 = điểm cao nhất.
const N = 40;
const attempts = Array.from({ length: N }, (_, i) => ({ id: 'A' + String(i).padStart(2, '0'), score: 100 - i }));
const upperHalf = (i) => i < N / 2;
const mk = (qid, pick) => attempts.map((a, i) => { const sel = pick(i); return { attemptId: a.id, score: a.score, questionId: qid, selectedAnswerIds: sel.ids, isCorrect: sel.ok }; });
const R = (ok, ...ids) => ({ ok, ids });
const questions = new Map([
  ['Q_GOOD', { content: 'Câu tốt', topicId: 'T1', difficulty: 'medium', scope: 'common', answerType: 'single' }],
  ['Q_KEY',  { content: 'Câu nghi sai đáp án', topicId: 'T1', difficulty: 'medium', scope: 'common', answerType: 'single' }],
  ['Q_EASY', { content: 'Câu quá dễ', topicId: 'T1', difficulty: 'easy', scope: 'common', answerType: 'single' }],
  ['Q_FEW',  { content: 'Câu ít dữ liệu', topicId: 'T1', difficulty: 'easy', scope: 'common', answerType: 'single' }],
  ['Q_MIS',  { content: 'Khai báo khó nhưng ai cũng đúng 90%', topicId: 'T1', difficulty: 'hard', scope: 'common', answerType: 'single' }],
  ['Q_LOW',  { content: 'Câu 10 lượt, độ phân biệt âm nhưng mẫu nhỏ', topicId: 'T1', difficulty: 'medium', scope: 'common', answerType: 'single' }],
]);
const opts = (qid) => [
  { answerId: qid + '_a', content: 'A', isCorrect: true },
  { answerId: qid + '_b', content: 'B', isCorrect: false },
  { answerId: qid + '_c', content: 'C', isCorrect: false },
];
const options = new Map([...questions.keys()].map((q) => [q, opts(q)]));
const responses = [
  // GOOD: nửa trên đúng 90%, nửa dưới đúng 20%
  ...mk('Q_GOOD', (i) => (upperHalf(i) ? (i % 10 === 0 ? R(false, 'Q_GOOD_b') : R(true, 'Q_GOOD_a')) : (i % 5 === 0 ? R(true, 'Q_GOOD_a') : R(false, 'Q_GOOD_c')))),
  // KEY: nửa trên chọn B (nhiễu), nửa dưới chọn A (đáp án đúng) -> độ phân biệt âm
  ...mk('Q_KEY', (i) => (upperHalf(i) ? R(false, 'Q_KEY_b') : R(true, 'Q_KEY_a'))),
  // EASY: tất cả đúng
  ...mk('Q_EASY', () => R(true, 'Q_EASY_a')),
  // MIS: 90% đúng ở cả hai nửa (i % 10 !== 9 đúng)
  ...mk('Q_MIS', (i) => (i % 10 === 9 ? R(false, 'Q_MIS_b') : R(true, 'Q_MIS_a'))),
  // LOW: 10 lượt (đủ hiện chỉ số, chưa đủ tin cậy để gắn cờ)
  ...mk('Q_LOW', (i) => (i % 2 ? R(true, 'Q_LOW_a') : R(false, 'Q_LOW_b'))).slice(0, 10),
  // FEW: chỉ 4 lượt trả lời
  ...mk('Q_FEW', () => R(true, 'Q_FEW_a')).slice(0, 4),
];
const stats = Object.fromEntries(svc.computeQuestionStats(responses, questions, options).map((s) => [s.questionId, s]));

check('Q_FEW: dưới 5 lượt -> insufficientData, không có chỉ số', stats.Q_FEW.insufficientData && stats.Q_FEW.correctRate === null && stats.Q_FEW.responses === 4);
check('Q_GOOD: độ phân biệt cao (>0.4), không cờ nghi sai', stats.Q_GOOD.discrimination > 0.4 && !stats.Q_GOOD.flags.includes('suspect_key'), `D=${stats.Q_GOOD.discrimination} p=${stats.Q_GOOD.correctRate}`);
check('Q_KEY: độ phân biệt âm -> cờ suspect_key', stats.Q_KEY.discrimination < 0 && stats.Q_KEY.flags.includes('suspect_key'), `D=${stats.Q_KEY.discrimination}`);
check('Q_KEY: đáp án nhiễu B được nhóm điểm cao chọn nhiều hơn đáp án đúng', (() => { const o = stats.Q_KEY.options; return o.find((x) => x.answerId === 'Q_KEY_b').upperRate > o.find((x) => x.isCorrect).upperRate; })());
check('Q_EASY: p=1 -> too_easy, KHÔNG gắn low_discrimination', stats.Q_EASY.flags.includes('too_easy') && !stats.Q_EASY.flags.includes('low_discrimination'));
check('Q_MIS: khai báo hard nhưng p>=0.85 -> difficulty_mismatch', stats.Q_MIS.flags.includes('difficulty_mismatch'), `p=${stats.Q_MIS.correctRate}`);
check('Độ tin cậy: 40 lượt = ok, 4 lượt = low', stats.Q_GOOD.reliability === 'ok' && stats.Q_FEW.reliability === 'low');
check('Q_LOW: 10 lượt -> có chỉ số, độ tin cậy thấp, KHÔNG gắn cờ nào', !stats.Q_LOW.insufficientData && stats.Q_LOW.reliability === 'low' && stats.Q_LOW.flags.length === 0 && stats.Q_LOW.discrimination < 0, `D=${stats.Q_LOW.discrimination}`);
check('Tỷ lệ chọn từng đáp án cộng lại = 1 (câu 1 đáp án)', Math.abs(stats.Q_GOOD.options.reduce((s, o) => s + o.selectedRate, 0) - 1) < 0.02);

// ───────────── 2) Năng lực theo chủ đề / phòng ban (hàm thuần) ─────────────
const tally = svc.tallyByTopic([
  ...Array(4).fill({ topicId: 'T1', source: 'official', correct: true }),
  ...Array(2).fill({ topicId: 'T1', source: 'practice', correct: false }),
  ...Array(3).fill({ topicId: 'T2', source: 'practice', correct: true }),
]);
const topics = svc.buildTopicCompetency(tally, new Map([['T1', 'An toàn'], ['T2', 'Cơ khí']]));
const t1 = topics.find((t) => t.topicId === 'T1'), t2 = topics.find((t) => t.topicId === 'T2');
check('Năng lực: T1 gộp 4 đúng/6 = 0.67, đủ dữ liệu', t1.total === 6 && t1.rate === 0.67 && !t1.insufficientData && t1.official.rate === 1 && t1.practice.rate === 0);
check('Năng lực: T2 chỉ 3 câu -> chưa đủ dữ liệu, không vào danh sách yếu', t2.insufficientData && svc.pickWeakest(topics).every((w) => w.topicId !== 'T2'));

// ───────────── 3) Luồng DB (giả lập model) ─────────────
const idEq = (a, b) => String(a) === String(b);
function match(doc, filter) {
  return Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === 'object' && '$in' in v) return v.$in.some((x) => (Array.isArray(doc[k]) ? doc[k].some((y) => idEq(y, x)) : idEq(doc[k], x)));
    if (v && typeof v === 'object') return true; // điều kiện khác: bỏ qua
    return idEq(doc[k], v);
  });
}
const chain = (rows) => { const c = { select: () => c, sort: () => c, lean: () => Promise.resolve(rows), distinct: (f) => Promise.resolve(rows.map((r) => r[f])), then: (res, rej) => Promise.resolve(rows).then(res, rej) }; return c; };
const stub = (Model, data, one = false) => { Model[one ? 'findOne' : 'find'] = (f = {}) => { const r = data.filter((d) => match(d, f)); return chain(one ? r[0] ?? null : r); }; };

const topicsDb = [{ _id: 'T1', name: 'An toàn lao động' }, { _id: 'T2', name: 'Kỹ thuật cơ khí' }];
const depts = [{ _id: 'D1', name: 'Kỹ thuật' }, { _id: 'D2', name: 'Kế hoạch' }];
const emps = ['E1', 'E2', 'E3', 'E4'].map((e) => ({ _id: e, departmentId: 'D1', userId: e === 'E1' ? 'U1' : 'U' + e }))
  .concat(['E5', 'E6'].map((e) => ({ _id: e, departmentId: 'D2', userId: 'U' + e })));
const cands = emps.map((e, i) => ({ _id: 'C' + (i + 1), employeeId: e._id, examId: 'X1' }));
const atts = cands.map((c, i) => ({ _id: 'A' + (i + 1), examCandidateId: c._id, attemptType: 'official', status: 'submitted', autoSubmitReason: i === 0 ? 'inactive_timeout' : undefined }));
const qs = [{ _id: 'Q1', topicId: 'T1' }, { _id: 'Q2', topicId: 'T1' }, { _id: 'Q3', topicId: 'T2' }];
const cans = [];
for (const a of atts) for (const q of qs) {
  const blank = a._id === 'A1' && q._id === 'Q3'; // lượt tự nộp của E1: Q3 bỏ trống
  cans.push({ examAttemptId: a._id, questionId: q._id, selectedAnswerIds: blank ? [] : ['x'], isCorrect: !blank && q._id !== 'Q2' });
}
stub(M.Topic, topicsDb); stub(M.Department, depts); stub(M.Employee, emps); stub(M.Employee, emps, true);
stub(M.ExamCandidate, cands); stub(M.ExamAttempt, atts); stub(M.CandidateAnswer, cans); stub(M.Question, qs);
const practiceQs = Array.from({ length: 6 }, () => ({ questionId: 'Q1', checked: true, isCorrect: true }));
PracticeSession.find = () => chain([{ status: 'submitted', questions: practiceQs }]);

const me = await svc.analyticsService.getMyCompetency('U1');
const meT1 = me.topics.find((t) => t.topicId === 'T1'), meT2 = me.topics.find((t) => t.topicId === 'T2');
check('Của tôi: T1 = 2 câu thi (Q1,Q2) + 6 câu luyện tập = 8', meT1.official.total === 2 && meT1.practice.total === 6 && meT1.total === 8, JSON.stringify({ o: meT1.official, p: meT1.practice }));
check('Của tôi: câu bỏ trống của bài bị hệ thống tự nộp bị loại (T2 không có câu nào)', !meT2 || meT2.total === 0);
check('Của tôi: T1 đủ dữ liệu, rate = 7/8', !meT1.insufficientData && meT1.rate === 0.88, `rate=${meT1.rate}`);

const dept = await svc.analyticsService.getDepartmentCompetency({});
const d1 = dept.departments.find((d) => d.departmentId === 'D1'), d2 = dept.departments.find((d) => d.departmentId === 'D2');
check('Phòng ban: D1 có 4 thí sinh -> hiện số liệu', d1.candidates === 4 && !d1.insufficientData);
check('Phòng ban: D2 chỉ 2 thí sinh -> ẩn toàn bộ số liệu (bảo vệ cá nhân)', d2.candidates === 2 && d2.insufficientData && d2.overallRate === null && d2.topics.every((t) => t.rate === null && t.total === null));
const d1T1 = d1.topics.find((t) => t.topicId === 'T1'), d1T2 = d1.topics.find((t) => t.topicId === 'T2');
check('Phòng ban: D1/T1 có 8 câu (4 người x 2 câu) -> có tỷ lệ 0.5', d1T1.total === 8 && d1T1.rate === 0.5, `total=${d1T1.total} rate=${d1T1.rate}`);
check('Phòng ban: D1/T2 chỉ 3 câu (1 câu bỏ trống bị loại) -> chưa đủ dữ liệu', d1T2.total === 3 && d1T2.insufficientData && d1T2.rate === null);
check('Phòng ban: không có trường nào lộ danh tính (không employeeId/userId)', !JSON.stringify(dept).match(/"E[1-6]"|"U[0-9A-Z]+"/));

// Kiêm nhiệm: E4 (phòng chính D1) thi bằng vai trò D2 -> tính cho D2, không tính cho D1.
stub(M.ExamAttempt, atts.map((a) => (a._id === 'A4' ? { ...a, departmentId: 'D2' } : a)));
const deptRole = await svc.analyticsService.getDepartmentCompetency({});
const r1 = deptRole.departments.find((d) => d.departmentId === 'D1'), r2 = deptRole.departments.find((d) => d.departmentId === 'D2');
check('Phòng ban theo vai trò đã thi: D1 còn 3, D2 có 3 (E4 thi vai trò D2)', r1.candidates === 3 && r2.candidates === 3 && !r2.insufficientData, `D1=${r1.candidates} D2=${r2.candidates}`);
stub(M.ExamAttempt, atts);

stub(M.Result, atts.map((a, i) => ({ examAttemptId: a._id, score: 100 - i * 10 }))); stub(M.Answer, []);
const qa = await svc.analyticsService.getQuestionAnalysis({});
check('Phân tích câu hỏi: loại lượt thi bị hệ thống tự nộp (A1) khỏi mẫu', qa.meta.attemptsAnalyzed === 5 && qa.items.every((i) => i.responses === 5));
check('Phân tích câu hỏi: đúng 5 lượt = đủ ngưỡng tối thiểu', qa.items.every((i) => !i.insufficientData));
process.exit(fail ? 1 : 0);

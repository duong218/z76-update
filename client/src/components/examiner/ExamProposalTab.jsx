import { useState, useEffect, useRef } from 'react';
import { fetchMyExamProposals, createExamProposal, updateExamProposal, submitForReview, fetchTopics, fetchQuestionStatsByTopic } from '../../services/examiner.service';
import { FilePlus, Pencil, Send, AlertCircle, AlertTriangle, Clock, CheckCircle, XCircle, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { useToast } from '../ToastContext';
import { useConfirm } from '../ConfirmDialog';
import { useScrollLock } from '../../hooks/useScrollLock';

// MỚI — Dropdown chọn chủ đề tự dựng, thay cho thẻ <select> gốc của trình
// duyệt. Danh sách xổ xuống của <select> native do OS/trình duyệt tự vẽ,
// không bị ràng buộc bởi kích thước modal cha nên có thể tràn ra ngoài viền
// modal/màn hình (đặc biệt trên mobile). Component này tự đo khoảng trống
// còn lại trong viewport để quyết định mở xuống hay lật lên trên, và luôn
// giới hạn chiều rộng/chiều cao trong phạm vi màn hình.
function TopicSelect({ value, options, onChange, placeholder = '-- Chọn chủ đề --' }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({ placement: 'bottom', maxHeight: 240 });
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open || !wrapperRef.current) return undefined;

    const PREFERRED_MAX_HEIGHT = 240;
    const VIEWPORT_MARGIN = 12;

    const recalcPosition = () => {
      const rect = wrapperRef.current.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN;
      const spaceAbove = rect.top - VIEWPORT_MARGIN;

      if (spaceBelow >= 120 || spaceBelow >= spaceAbove) {
        setMenuStyle({ placement: 'bottom', maxHeight: Math.max(120, Math.min(PREFERRED_MAX_HEIGHT, spaceBelow)) });
      } else {
        setMenuStyle({ placement: 'top', maxHeight: Math.max(120, Math.min(PREFERRED_MAX_HEIGHT, spaceAbove)) });
      }
    };

    recalcPosition();
    window.addEventListener('resize', recalcPosition);
    window.addEventListener('scroll', recalcPosition, true);
    return () => {
      window.removeEventListener('resize', recalcPosition);
      window.removeEventListener('scroll', recalcPosition, true);
    };
  }, [open]);

  const selectedOption = options.find((o) => o._id === value);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full p-2.5 pr-10 text-base border border-slate-300 rounded-lg focus:border-[#008BC5] outline-none bg-white text-left relative"
        style={{ color: value ? '#0F172A' : '#64748B' }}
      >
        {selectedOption ? selectedOption.name : placeholder}
        <ChevronDown
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none transition-transform"
          style={{ transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)' }}
        />
      </button>

      {open && (
        <div
          className={`absolute z-20 w-full overflow-y-auto bg-white rounded-lg border border-slate-200 shadow-lg py-1 ${
            menuStyle.placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          style={{ maxHeight: `${menuStyle.maxHeight}px` }}
          data-lenis-prevent
        >
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className="w-full text-left px-3.5 min-h-[44px] flex items-center text-base"
            style={!value ? { backgroundColor: '#EAF6FF', color: '#008BC5', fontWeight: 600 } : { color: '#0F172A' }}
          >
            {placeholder}
          </button>
          {options.map((opt) => (
            <button
              key={opt._id}
              type="button"
              onClick={() => { onChange(opt._id); setOpen(false); }}
              className="w-full text-left px-3.5 min-h-[44px] flex items-center text-base"
              style={value === opt._id ? { backgroundColor: '#EAF6FF', color: '#008BC5', fontWeight: 600 } : { color: '#0F172A' }}
            >
              {opt.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// MỚI — Danh sách đề xuất kỳ thi hiện tải hết 1 lần (không phân trang phía
// server, xem fetchMyExamProposals). Về sau số lượng đề xuất tăng dần theo
// thời gian sẽ khiến trang kéo dài mãi, nên phân trang phía client, mỗi lượt
// hiển thị 10 kỳ thi.
const PAGE_SIZE = 10;

// MỚI — Giá trị mặc định của form khi mở modal "Tạo đề xuất mới" (tách riêng
// hằng số để openCreateModal() dùng lại được, tránh lặp lại object literal).
const DEFAULT_FORM_DATA = {
  title: '',
  topicId: '',
  durationMinutes: 30,
  totalQuestions: 20,
  commonQuestionCount: 10,
  departmentQuestionCount: 10,
  passThresholdPercent: 70,
  // MỚI — Công tắc BÙ CÂU CHUNG: mặc định TẮT (công bằng). Bật = phòng thiếu câu riêng được bù bằng câu chung (hành vi cũ).
  allowCommonCompensation: false,
  // MỚI — Phạm vi phòng ban được thi: mặc định tất cả phòng ban.
  departmentScope: 'all',
  allowedDepartmentIds: [],
};

// MỚI — Hiển thị phạm vi phòng ban trên danh sách đề xuất (kỳ thi cũ không có field = tất cả).
function formatExamScopeLabel(exam) {
  if (exam.departmentScope !== 'selected') return 'Tất cả phòng ban';
  const names = (exam.allowedDepartmentIds ?? [])
    .map((d) => (typeof d === 'object' && d?.name ? d.name : null))
    .filter(Boolean);
  return names.length ? names.join(', ') : 'Chọn phòng ban (chưa có danh sách)';
}

export const ExamProposalTab = () => {
  const { showToast } = useToast();
  const confirmAction = useConfirm();
  const [exams, setExams] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // MỚI — id của đề đang được SỬA (null = modal đang ở chế độ "tạo mới").
  // Dùng để form biết gọi updateExamProposal thay vì createExamProposal, và
  // để đổi tiêu đề/nút bấm của modal cho đúng ngữ cảnh.
  const [editingExamId, setEditingExamId] = useState(null);

  useScrollLock(isModalOpen);
  // MỚI — Trang hiện tại của danh sách đề xuất (phân trang client-side, 10
  // kỳ thi/trang). Reset về trang 1 mỗi khi tải lại danh sách (xem loadData).
  const [page, setPage] = useState(1);

  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);

  // Thống kê số câu hỏi (chung + riêng theo từng bộ phận) của chủ đề đang
  // chọn trong form — dùng để hiển thị gợi ý và validate ngay trên UI, tránh
  // để tới lúc Người duyệt đề publish mới phát hiện thiếu câu hỏi.
  const [topicStats, setTopicStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (!formData.topicId) {
      setTopicStats(null);
      return;
    }
    let cancelled = false;
    setStatsLoading(true);
    fetchQuestionStatsByTopic(formData.topicId)
      .then((data) => { if (!cancelled) setTopicStats(data); })
      .catch(() => { if (!cancelled) setTopicStats(null); })
      .finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, [formData.topicId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [examsData, topicsData] = await Promise.all([
        fetchMyExamProposals(),
        fetchTopics()
      ]);
      setExams(Array.isArray(examsData) ? examsData : []);
      setTopics(Array.isArray(topicsData) ? topicsData : []);
      setPage(1);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Tính trước xem cấu hình (commonQuestionCount/departmentQuestionCount) có
  // khả thi không, THEO ĐÚNG công thức bù mà backend
  // (exam-code-generation.service.js) đang dùng: nếu 1 bộ phận thiếu câu
  // riêng, phần thiếu sẽ được bù từ pool câu chung. Chỉ thật sự KHÔNG khả
  // thi nếu pool chung không đủ để bù cho bộ phận đó.
  const commonCount = topicStats?.commonCount ?? 0;
  const common = Number(formData.commonQuestionCount) || 0;
  const perDept = Number(formData.departmentQuestionCount) || 0;
  const total = Number(formData.totalQuestions) || 0;

  const commonExceedsPool = common > commonCount;
  const sumMismatch = formData.topicId && common + perDept !== total;

  // Công tắc bù câu chung (MỚI): BẬT -> thiếu câu riêng thì bù từ pool chung (chỉ chặn khi pool chung không đủ bù).
  // TẮT -> KHÔNG bù: phòng thiếu câu riêng không bị chặn lưu đề, nhưng sẽ bị KHÓA khỏi danh sách vai trò thi (chỉ cảnh báo).
  const allowCompensation = Boolean(formData.allowCommonCompensation);
  const scopeMode = formData.departmentScope === 'selected' ? 'selected' : 'all';
  const allowedDeptIdSet = new Set((formData.allowedDepartmentIds ?? []).map(String));

  // MỚI — Chỉ kiểm tra / cảnh báo các phòng nằm trong phạm vi thi (mode all: phòng có ≥1 NV).
  const isDeptInFormScope = (d) => {
    if (scopeMode === 'selected') return allowedDeptIdSet.has(String(d.departmentId));
    return (d.employeeCount ?? 0) > 0;
  };

  const scopedDepartments = (topicStats?.departments ?? []).filter(isDeptInFormScope);

  const infeasibleDepartments = scopedDepartments
    .map((d) => {
      const shortfall = Math.max(0, perDept - d.count);
      const neededCommon = common + shortfall;
      return {
        ...d,
        shortfall,
        neededCommon,
        infeasible: allowCompensation && neededCommon > commonCount,
      };
    })
    .filter((d) => d.shortfall > 0);

  const scopeInsufficientDepartments =
    !allowCompensation && perDept > 0
      ? scopedDepartments.filter((d) => d.count < perDept)
      : [];

  const excludedScopeDepartments =
    scopeMode === 'selected'
      ? (topicStats?.departments ?? []).filter((d) => !allowedDeptIdSet.has(String(d.departmentId)))
      : [];

  const hasBlockingError =
    !!formData.topicId &&
    (commonExceedsPool ||
      sumMismatch ||
      infeasibleDepartments.some((d) => d.infeasible) ||
      scopeInsufficientDepartments.length > 0);

  // MỚI — Mở modal ở chế độ "Tạo mới": reset form về mặc định, editingExamId
  // = null để form biết gọi createExamProposal khi submit.
  const openCreateModal = () => {
    setEditingExamId(null);
    setFormData(DEFAULT_FORM_DATA);
    setIsModalOpen(true);
  };

  // MỚI — Mở modal ở chế độ "Chỉnh sửa": nạp sẵn dữ liệu của đề đang chọn
  // vào form (đúng như dữ liệu hiện có, không phải giá trị mặc định), rồi
  // mở modal y hệt giao diện tạo mới. topicId có thể là object đã populate
  // (exam.topicId?.name) hoặc string id tuỳ nơi gọi — chuẩn hoá về string id
  // để TopicSelect nhận đúng giá trị.
  const openEditModal = (exam) => {
    setEditingExamId(exam._id);
    setFormData({
      title: exam.title,
      topicId: exam.topicId?._id ?? exam.topicId ?? '',
      durationMinutes: exam.durationMinutes,
      totalQuestions: exam.totalQuestions,
      commonQuestionCount: exam.commonQuestionCount,
      departmentQuestionCount: exam.departmentQuestionCount,
      passThresholdPercent: exam.passThresholdPercent,
      // Kỳ thi cũ chưa có field này được hệ thống coi là đang BẬT bù -> hiển thị đúng như vậy khi sửa
      allowCommonCompensation: exam.allowCommonCompensation !== false,
      departmentScope: exam.departmentScope === 'selected' ? 'selected' : 'all',
      allowedDepartmentIds:
        exam.departmentScope === 'selected'
          ? (exam.allowedDepartmentIds ?? []).map((d) => String(d._id ?? d))
          : [],
    });
    setIsModalOpen(true);
  };

  const toggleAllowedDepartment = (departmentId) => {
    const key = String(departmentId);
    setFormData((prev) => {
      const set = new Set((prev.allowedDepartmentIds ?? []).map(String));
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...prev, allowedDepartmentIds: [...set] };
    });
  };

  const switchToSelectedScope = () => {
    setFormData((prev) => {
      if (prev.departmentScope === 'selected') return prev;
      const allIds = (topicStats?.departments ?? []).map((d) => String(d.departmentId));
      return { ...prev, departmentScope: 'selected', allowedDepartmentIds: allIds };
    });
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingExamId(null);
  };

  // ĐỔI — Dùng chung cho cả "Tạo mới" và "Chỉnh sửa": nếu editingExamId có
  // giá trị thì gọi updateExamProposal (PATCH), ngược lại gọi
  // createExamProposal (POST) như trước. Cùng 1 validate, cùng 1 payload.
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formData.topicId) {
      showToast('Vui lòng chọn chủ đề liên kết cho kỳ thi.', 'warning');
      return;
    }
    if (hasBlockingError) {
      showToast('Cấu hình số câu hỏi chưa hợp lệ so với ngân hàng câu hỏi hiện có của chủ đề này. Vui lòng kiểm tra lại phần cảnh báo trong form.', 'warning');
      return;
    }
    if (scopeMode === 'selected' && allowedDeptIdSet.size === 0) {
      showToast('Vui lòng chọn ít nhất một phòng ban trong phạm vi được thi.', 'warning');
      return;
    }
    if (excludedScopeDepartments.length > 0) {
      const names = excludedScopeDepartments.map((d) => d.name).join(', ');
      const ok = await confirmAction(
        `Các phòng ban sau sẽ không được phép tham gia thi: ${names}. Bạn vẫn muốn lưu đề xuất?`,
        { title: 'Xác nhận phạm vi phòng ban', confirmLabel: 'Vẫn lưu', danger: false },
      );
      if (!ok) return;
    }
    const payload = {
      ...formData,
      durationMinutes: Number(formData.durationMinutes),
      totalQuestions: Number(formData.totalQuestions),
      commonQuestionCount: Number(formData.commonQuestionCount),
      departmentQuestionCount: Number(formData.departmentQuestionCount),
      passThresholdPercent: Number(formData.passThresholdPercent),
      allowCommonCompensation: Boolean(formData.allowCommonCompensation),
      departmentScope: scopeMode,
      allowedDepartmentIds: scopeMode === 'selected' ? [...allowedDeptIdSet] : undefined,
    };
    try {
      if (editingExamId) {
        await updateExamProposal(editingExamId, payload);
        showToast('Đã lưu thay đổi. Đề xuất đã quay về trạng thái Nháp — nhớ Gửi duyệt lại nhé.', 'success');
      } else {
        await createExamProposal(payload);
        showToast('Đã tạo đề xuất kỳ thi thành công.', 'success');
      }
      closeModal();
      loadData();
    } catch (error) {
      showToast(error.message || (editingExamId ? 'Lỗi khi lưu thay đổi' : 'Lỗi khi tạo đề xuất'), 'error');
    }
  };

  // Nhãn text thuần (không kèm icon/màu) cho từng trạng thái — dùng để ghép
  // vào câu thông báo lỗi (mục đích khác với getStatusBadge() vốn để render
  // JSX trong bảng), tránh lặp lại chuỗi tiếng Việt ở 2 nơi dễ lệch nhau.
  const STATUS_TEXT_LABELS = {
    draft: 'Nháp',
    pending_review: 'Chờ duyệt',
    rejected: 'Bị từ chối',
    approved: 'Đã duyệt',
    published: 'Đã đăng',
    archived: 'Đã lưu trữ',
  };

  const handleSubmitReview = async (id) => {
    const ok = await confirmAction(
      'Bạn có chắc chắn muốn gửi đề xuất này cho Người duyệt đề duyệt?',
      { title: 'Gửi duyệt đề xuất', confirmLabel: 'Gửi duyệt', danger: false }
    );
    if (!ok) return;
    try {
      const data = await submitForReview(id);
      showToast('Đã gửi đề xuất cho Người duyệt đề.', 'success');
      if (data?.warnings?.outOfScopeEmployeeCount > 0) {
        const deptText = (data.warnings.outOfScopeDepartments ?? [])
          .map((d) => `${d.name} (${d.employeeCount} NV)`)
          .join(', ');
        showToast(
          `Cảnh báo: ${data.warnings.outOfScopeEmployeeCount} nhân viên ngoài phạm vi kỳ thi${deptText ? ` — ${deptText}` : ''}.`,
          'warning',
        );
      }
      loadData();
    } catch (error) {
      // EXAM_INVALID_STATUS: kỳ thi không còn ở trạng thái draft/rejected nữa
      // (vd đã được gửi duyệt từ 1 tab/thiết bị khác đang mở song song trước
      // đó — backend chặn đúng để tránh gửi duyệt trùng lặp). Trường hợp này
      // KHÔNG phải lỗi thật, chỉ là dữ liệu trên UI đang cũ hơn DB — nên cần
      // tự tải lại danh sách để badge trạng thái cập nhật đúng ngay, và nói
      // rõ trạng thái THẬT hiện tại thay vì message chung chung của backend,
      // để người dùng hiểu ngay tại sao không gửi được nữa mà không cần tự đoán.
      if (error.code === 'EXAM_INVALID_STATUS') {
        const freshExams = await fetchMyExamProposals().catch(() => null);
        const freshExam = Array.isArray(freshExams) ? freshExams.find((e) => e._id === id) : null;
        const statusText = freshExam ? STATUS_TEXT_LABELS[freshExam.status] || freshExam.status : null;
        showToast(
          statusText
            ? `Kỳ thi này đã ở trạng thái "${statusText}" (có thể vừa được thao tác từ tab hoặc thiết bị khác) nên không thể gửi duyệt lại. Danh sách đã được tải lại cho đúng trạng thái mới nhất.`
            : 'Kỳ thi không còn ở trạng thái phù hợp để gửi duyệt (có thể vừa được thao tác từ tab hoặc thiết bị khác). Danh sách đã được tải lại cho đúng trạng thái mới nhất.',
          'warning',
        );
        loadData();
        return;
      }
      showToast(error.message || 'Lỗi khi gửi duyệt', 'error');
    }
  };

  // MỚI — Cắt danh sách theo trang hiện tại (10 kỳ thi/trang). exams giữ
  // nguyên toàn bộ dữ liệu gốc (không đổi) — chỉ pagedExams (phần hiển thị)
  // thay đổi theo `page`.
  const totalPages = Math.max(1, Math.ceil(exams.length / PAGE_SIZE));
  const pagedExams = exams.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'draft': return <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-medium border border-slate-200 flex items-center gap-1"><FilePlus className="w-3 h-3" /> Nháp</span>;
      case 'pending_review': return <span className="bg-[#FFFBEB] text-[#B45309] px-2 py-1 rounded text-xs font-medium border border-[#F6AD37]/40 flex items-center gap-1"><Clock className="w-3 h-3" /> Chờ duyệt</span>;
      case 'rejected': return <span className="bg-[#FEECEC] text-[#C53030] px-2 py-1 rounded text-xs font-medium border border-[#E53E3E]/30 flex items-center gap-1"><XCircle className="w-3 h-3" /> Bị từ chối</span>;
      case 'approved': return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium border border-blue-200 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Đã duyệt</span>;
      case 'published': return <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-medium border border-emerald-200 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Đã đăng</span>;
      case 'archived': return <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-medium border border-gray-200">Đã lưu trữ</span>;
      default: return <span>{status}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* MỚI — animate-fade-in-up: đồng bộ hiệu ứng xuất hiện khi tab vừa tải
          xong, cùng pattern với AccountTab.jsx / AuditLogTab.jsx bên Admin. */}
      <div className="animate-fade-in-up flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm" style={{ '--stagger-delay': '0ms' }}>
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#0F172A]">Danh sách đề xuất kỳ thi</h2>
          <p className="text-sm text-slate-500">Tạo cấu trúc đề thi và trình Người duyệt đề phê duyệt</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-[#008BC5] hover:bg-sky-600 active:bg-sky-600 text-white rounded-lg font-medium transition-colors w-full sm:w-auto"
        >
          <FilePlus className="w-4 h-4" /> Tạo đề xuất mới
        </button>
      </div>

      {/* Trên mobile dùng danh sách dạng thẻ (dễ đọc, không phải cuộn ngang);
          từ md trở lên vẫn dùng bảng như cũ vì màn hình đủ rộng. */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-slate-500 text-sm">
          Đang tải...
        </div>
      ) : exams.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 sm:p-12 text-center text-slate-500">
          <FilePlus className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-600 text-base">Chưa có đề xuất nào</p>
          <p className="text-sm mt-1">Bấm "Tạo đề xuất mới" để bắt đầu</p>
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="animate-fade-in-up md:hidden space-y-3" style={{ '--stagger-delay': '80ms' }}>
            {pagedExams.map(exam => (
              <div key={exam._id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-800 text-base leading-snug break-words">{exam.title}</h3>
                    <p className="text-sm text-slate-500 mt-0.5 break-words">{exam.topicId?.name}</p>
                  </div>
                  <div className="shrink-0">{getStatusBadge(exam.status)}</div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 rounded-lg p-2.5 text-xs text-slate-600">
                  <div>
                    <div className="font-semibold text-slate-800">{exam.durationMinutes}p</div>
                    <div>Thời gian</div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">{exam.totalQuestions}</div>
                    <div>Tổng câu</div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">{exam.commonQuestionCount}/{exam.departmentQuestionCount}</div>
                    <div>Chung/Riêng</div>
                  </div>
                </div>
                <p className="text-xs text-slate-500">Phạm vi: {formatExamScopeLabel(exam)}</p>

                {exam.status === 'rejected' && exam.rejectionReason && (
                  <div className="flex items-start gap-1.5 text-[#C53030] text-xs bg-[#FEECEC] p-2.5 rounded-lg">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{exam.rejectionReason}</span>
                  </div>
                )}

                {(exam.status === 'draft' || exam.status === 'rejected') && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditModal(exam)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-slate-100 hover:bg-slate-200 active:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
                    >
                      <Pencil className="w-4 h-4" /> Chỉnh sửa
                    </button>
                    <button
                      onClick={() => handleSubmitReview(exam._id)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-[#FFFBEB] hover:bg-[#FDECC8] active:bg-[#FDECC8] text-[#92400E] rounded-lg font-medium transition-colors"
                    >
                      <Send className="w-4 h-4" /> Gửi duyệt
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop / tablet table */}
          <div className="animate-fade-in-up hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" style={{ '--stagger-delay': '80ms' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm">
                    <th className="p-4 font-semibold">Tên kỳ thi</th>
                    <th className="p-4 font-semibold">Chủ đề</th>
                    <th className="p-4 font-semibold">Cấu trúc</th>
                    <th className="p-4 font-semibold">Trạng thái</th>
                    <th className="p-4 font-semibold">Ghi chú</th>
                    <th className="p-4 font-semibold text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {pagedExams.map(exam => (
                    <tr key={exam._id} className="hover:bg-slate-50">
                      <td className="p-4 font-medium text-slate-800">{exam.title}</td>
                      <td className="p-4 text-slate-600">{exam.topicId?.name}</td>
                      <td className="p-4 text-slate-600 text-xs">
                        <div>Thời gian: {exam.durationMinutes}p</div>
                        <div>Tổng câu: {exam.totalQuestions}</div>
                        <div>Chung: {exam.commonQuestionCount} / Riêng: {exam.departmentQuestionCount}</div>
                        <div>Bù câu chung: {exam.allowCommonCompensation === false ? 'Tắt' : 'Bật'}</div>
                        <div>Phạm vi: {formatExamScopeLabel(exam)}</div>
                      </td>
                      <td className="p-4">{getStatusBadge(exam.status)}</td>
                      <td className="p-4 text-slate-600">
                        {exam.status === 'rejected' && (
                          <div className="flex items-start gap-1 text-[#C53030] text-xs bg-[#FEECEC] p-2 rounded">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{exam.rejectionReason}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        {(exam.status === 'draft' || exam.status === 'rejected') && (
                          <div className="inline-flex gap-2">
                            <button
                              onClick={() => openEditModal(exam)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium transition-colors"
                            >
                              <Pencil className="w-4 h-4" /> Chỉnh sửa
                            </button>
                            <button
                              onClick={() => handleSubmitReview(exam._id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFBEB] hover:bg-[#FDECC8] text-[#92400E] rounded font-medium transition-colors"
                            >
                              <Send className="w-4 h-4" /> Gửi duyệt
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* MỚI — Điều hướng trang, chỉ hiện khi có nhiều hơn 1 trang. */}
          {exams.length > PAGE_SIZE && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between gap-2">
              <p className="text-sm text-slate-500">
                Trang {page}/{totalPages} (Tổng {exams.length} đề xuất)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1}
                  className="w-11 h-11 flex items-center justify-center bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Trang trước"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === totalPages}
                  className="w-11 h-11 flex items-center justify-center bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Trang sau"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 sm:p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-slate-800">
                {editingExamId ? 'Chỉnh sửa đề xuất kỳ thi' : 'Tạo đề xuất kỳ thi mới'}
              </h2>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 p-2 -mr-2 min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto" data-lenis-prevent>
              <form id="createExamForm" onSubmit={handleSubmitForm} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tên kỳ thi</label>
                  <input required type="text" className="w-full p-2.5 text-base border border-slate-300 rounded-lg focus:border-[#008BC5] outline-none"
                    value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder="VD: Hội thi chuyên môn tháng 10" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Chủ đề liên kết</label>
                  <TopicSelect
                    value={formData.topicId}
                    options={topics}
                    onChange={(topicId) => setFormData({ ...formData, topicId })}
                  />
                </div>

                {formData.topicId && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
                    {statsLoading ? (
                      <p className="text-slate-500">Đang tải số liệu ngân hàng câu hỏi...</p>
                    ) : topicStats ? (
                      <>
                        <p className="font-semibold text-slate-700">
                          Ngân hàng câu hỏi của chủ đề này: <span className="text-[#008BC5]">{topicStats.commonCount} câu chung</span>
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
                          {topicStats.departments.map((d) => (
                            <div key={d.departmentId} className="flex justify-between text-slate-600">
                              <span className="truncate" title={d.name}>{d.name}</span>
                              <span className="font-semibold ml-1">{d.count}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-slate-400 italic">
                          {allowCompensation
                            ? 'Nếu bộ phận nào thiếu câu riêng, hệ thống sẽ tự động bù thêm từ pool câu chung khi phát hành đề — miễn pool chung còn đủ dư.'
                            : 'Đang TẮT bù câu chung: bộ phận nào thiếu câu riêng sẽ bị khóa, nhân viên không chọn được phòng đó để thi.'}
                        </p>
                      </>
                    ) : (
                      <p className="text-[#E53E3E]">Không tải được số liệu câu hỏi cho chủ đề này.</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Thời gian (phút)</label>
                    <input required type="number" min="1" inputMode="numeric" className="w-full p-2.5 text-base border border-slate-300 rounded-lg focus:border-[#008BC5] outline-none"
                      value={formData.durationMinutes} onChange={e => setFormData({ ...formData, durationMinutes: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tổng số câu hỏi</label>
                    <input required type="number" min="1" inputMode="numeric" className="w-full p-2.5 text-base border border-slate-300 rounded-lg focus:border-[#008BC5] outline-none"
                      value={formData.totalQuestions} onChange={e => setFormData({ ...formData, totalQuestions: e.target.value })} />
                  </div>
                </div>
                {sumMismatch && (
                  <p className="text-xs text-[#C53030] flex items-center gap-1 -mt-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Số câu chung + số câu bộ phận ({common + perDept}) phải bằng đúng Tổng số câu hỏi ({total}).
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Số câu hỏi chung</label>
                    <input required type="number" min="0" inputMode="numeric" className="w-full p-2.5 text-base border border-slate-300 rounded-lg focus:border-[#008BC5] outline-none"
                      value={formData.commonQuestionCount} onChange={e => setFormData({ ...formData, commonQuestionCount: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Số câu bộ phận</label>
                    <input required type="number" min="0" inputMode="numeric" className="w-full p-2.5 text-base border border-slate-300 rounded-lg focus:border-[#008BC5] outline-none"
                      value={formData.departmentQuestionCount} onChange={e => setFormData({ ...formData, departmentQuestionCount: e.target.value })} />
                  </div>
                </div>

                {formData.topicId && topicStats && (
                  <>
                    {commonExceedsPool && (
                      <p className="text-xs text-[#C53030] flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        Số câu chung ({common}) vượt quá số câu chung hiện có ({commonCount}) của chủ đề này.
                      </p>
                    )}
                    {scopeInsufficientDepartments.length > 0 && (
                      <div className="space-y-1">
                        {scopeInsufficientDepartments.map((d) => (
                          <p key={`scope-${d.departmentId}`} className="text-xs text-[#C53030] flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            {d.name}: chỉ có {d.count}/{perDept} câu riêng — không thể lưu (phòng trong phạm vi thi, kỳ thi đang TẮT bù câu chung).
                          </p>
                        ))}
                      </div>
                    )}
                    {infeasibleDepartments.length > 0 && (
                      <div className="space-y-1">
                        {infeasibleDepartments.map((d) => (
                          <p key={d.departmentId} className={`text-xs flex items-center gap-1 ${d.infeasible ? 'text-[#C53030]' : 'text-[#B45309]'}`}>
                            {d.infeasible ? <AlertCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                            {d.name}: chỉ có {d.count}/{perDept} câu riêng
                            {!allowCompensation
                              ? ' — phòng này sẽ bị KHÓA (không chọn được làm vai trò thi) vì kỳ thi không bù câu chung.'
                              : d.infeasible
                                ? ` — kể cả bù từ pool chung cũng không đủ (cần bù ${d.shortfall} câu nhưng pool chung chỉ có ${commonCount} câu, cần ${d.neededCommon} câu).`
                                : ` — sẽ tự bù ${d.shortfall} câu từ pool chung (đủ khả thi).`}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Điểm đạt tối thiểu (%)</label>
                  <input required type="number" min="0" max="100" inputMode="numeric" className="w-full p-2.5 text-base border border-slate-300 rounded-lg focus:border-[#008BC5] outline-none"
                    value={formData.passThresholdPercent} onChange={e => setFormData({ ...formData, passThresholdPercent: e.target.value })} />
                </div>

                {/* MỚI — Công tắc bù câu chung: chỉ sửa được khi đề còn ở trạng thái nháp/bị từ chối (form này không mở cho kỳ thi đã công bố) */}
                <label className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 w-5 h-5 shrink-0 accent-[#008BC5]"
                    checked={Boolean(formData.allowCommonCompensation)}
                    onChange={e => setFormData({ ...formData, allowCommonCompensation: e.target.checked })}
                  />
                  <span className="text-sm text-slate-700">
                    <span className="block font-medium text-slate-800">Cho phép bù câu hỏi chung khi phòng ban thiếu câu riêng</span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      <strong>Bật:</strong> phòng thiếu câu riêng vẫn thi được, phần thiếu bù bằng câu chung; nhân viên kiêm nhiệm
                      chọn phòng nào cũng được. <strong>Tắt (khuyến nghị cho công bằng):</strong> phòng chưa đủ câu riêng bị khóa,
                      nhân viên kiêm nhiệm không thể chọn phòng đó để thi đề toàn câu chung. Không đổi được sau khi kỳ thi đã công bố.
                    </span>
                  </span>
                </label>

                {/* MỚI — Cấu hình phạm vi phòng ban tham gia kỳ thi */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1">
                      Phạm vi phòng ban được phép thi
                    </label>
                    <p className="text-xs text-slate-500 mb-2">
                      Chọn xem toàn bộ nhà máy hay chỉ một số phòng ban/phân xưởng cụ thể được tham gia kỳ thi này.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, departmentScope: 'all', allowedDepartmentIds: [] })}
                        className={`p-2.5 rounded-lg border text-sm font-medium transition-colors text-center ${
                          formData.departmentScope !== 'selected'
                            ? 'bg-[#008BC5] text-white border-[#008BC5]'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        Tất cả phòng ban
                      </button>
                      <button
                        type="button"
                        onClick={switchToSelectedScope}
                        className={`p-2.5 rounded-lg border text-sm font-medium transition-colors text-center ${
                          formData.departmentScope === 'selected'
                            ? 'bg-[#008BC5] text-white border-[#008BC5]'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        Chọn phòng ban cụ thể
                      </button>
                    </div>
                  </div>

                  {formData.departmentScope === 'selected' && (
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700">
                          Danh sách phòng ban ({allowedDeptIdSet.size}/{(topicStats?.departments ?? []).length} đã chọn):
                        </span>
                        <div className="flex gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              const allIds = (topicStats?.departments ?? []).map((d) => String(d.departmentId));
                              setFormData({ ...formData, allowedDepartmentIds: allIds });
                            }}
                            className="text-[#008BC5] hover:underline"
                          >
                            Chọn tất cả
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, allowedDepartmentIds: [] })}
                            className="text-slate-500 hover:underline"
                          >
                            Bỏ chọn hết
                          </button>
                        </div>
                      </div>

                      {topicStats?.departments && topicStats.departments.length > 0 ? (
                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1 bg-white p-2 rounded-lg border border-slate-200">
                          {topicStats.departments.map((dept) => {
                            const isChecked = allowedDeptIdSet.has(String(dept.departmentId));
                            const hasNoEmp = (dept.employeeCount ?? 0) === 0;
                            return (
                              <label
                                key={dept.departmentId}
                                className={`flex items-center justify-between p-1.5 rounded hover:bg-slate-50 cursor-pointer text-xs ${
                                  isChecked ? 'bg-sky-50/50' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 accent-[#008BC5] rounded"
                                    checked={isChecked}
                                    onChange={() => toggleAllowedDepartment(dept.departmentId)}
                                  />
                                  <span className={`font-medium ${isChecked ? 'text-slate-900' : 'text-slate-600'}`}>
                                    {dept.name}
                                  </span>
                                  {hasNoEmp && (
                                    <span className="text-[10px] text-amber-600 bg-amber-50 px-1 rounded">
                                      (0 nhân viên)
                                    </span>
                                  )}
                                </div>
                                <span className="text-slate-400 font-mono text-[11px]">
                                  {dept.count} câu
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">
                          Vui lòng chọn chủ đề liên kết để xem danh sách phòng ban.
                        </p>
                      )}

                      {allowedDeptIdSet.size === 0 && (
                        <p className="text-xs text-[#C53030] flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          Cần chọn ít nhất một phòng ban trong phạm vi được thi.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </form>
            </div>

            <div className="p-4 sm:p-6 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row justify-end gap-3 shrink-0">
              <button type="button" onClick={closeModal} className="px-4 py-3 min-h-[46px] bg-slate-200 hover:bg-slate-300 active:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors">
                Hủy
              </button>
              <button type="submit" form="createExamForm" disabled={hasBlockingError}
                className="px-4 py-3 min-h-[46px] bg-[#008BC5] hover:bg-sky-600 active:bg-sky-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#008BC5]">
                {editingExamId ? 'Lưu thay đổi' : 'Lưu đề xuất'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchPendingExams,
  fetchApprovedExams,
  fetchExamHistory,
  approveExam,
  rejectExam,
  publishExam,
  fetchPublishImpact,
  archiveExam,
} from '../../services/exam-review.service';
import { CheckCircle, XCircle, Clock, Globe, History, Archive } from 'lucide-react';
import { useToast } from '../ToastContext';
import { useConfirm } from '../ConfirmDialog';
import { useScrollLock } from '../../hooks/useScrollLock';

// Cấu hình hiển thị badge trạng thái cho bảng "Lịch sử duyệt kỳ thi"
const STATUS_BADGE = {
  rejected: { label: 'Đã từ chối', className: 'bg-[#FEECEC] text-[#C53030]' },
  published: { label: 'Đang phát hành', className: 'bg-[#EAF6FF] text-[#008BC5]' },
  archived: { label: 'Đã lưu trữ', className: 'bg-[#F6F8FA] text-[#334155]' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_BADGE[status] || { label: status, className: 'bg-[#F6F8FA] text-[#334155]' };
  return (
    <span className={`inline-block px-2.5 py-1 rounded-lg text-sm font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// Nhãn text thuần cho MỌI trạng thái có thể có của Exam (không chỉ 3 trạng
// thái trong STATUS_BADGE ở trên, vốn chỉ dùng cho bảng "Lịch sử duyệt kỳ
// thi") — dùng để ghép vào câu thông báo lỗi khi thao tác bị chặn do kỳ thi
// đã đổi trạng thái ở nơi khác (tab/thiết bị khác), xem
// reportStaleStatusError() bên dưới.
const STATUS_TEXT_LABELS = {
  draft: 'Nháp',
  pending_review: 'Chờ duyệt',
  approved: 'Đã duyệt (chờ phát hành)',
  rejected: 'Đã từ chối',
  published: 'Đang phát hành',
  archived: 'Đã lưu trữ',
};

// Ô chọn ngày giờ (datetime-local) cho phép chọn "bây giờ" lệch tối đa chừng này (chỉ chính xác tới phút); khớp với server.
const START_TOLERANCE_MS = 5 * 60 * 1000;

// Date -> chuỗi 'YYYY-MM-DDTHH:mm' theo GIỜ ĐỊA PHƯƠNG, đúng định dạng của <input type="datetime-local">.
const toLocalInputValue = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const ExamReviewTab = () => {
  const { showToast } = useToast();
  const confirmAction = useConfirm();
  const [pendingExams, setPendingExams] = useState([]);
  const [approvedExams, setApprovedExams] = useState([]);
  const [historyExams, setHistoryExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [archivingId, setArchivingId] = useState(null);
  const [publishingId, setPublishingId] = useState(null);
  // Chống bấm đúp "Xác nhận duyệt" / "Từ chối" trong lúc request đang chạy
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reject Modal
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Approve Modal
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [approveId, setApproveId] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Thông báo lỗi ngày giờ ngay trong hộp thoại duyệt + mốc "bây giờ" làm giá trị nhỏ nhất của ô chọn ngày bắt đầu
  const [dateError, setDateError] = useState('');
  const [minStart, setMinStart] = useState('');

  useScrollLock(isRejectModalOpen || isApproveModalOpen);

  // Phân trang cho bảng "Lịch sử duyệt kỳ thi" — danh sách này không giới
  // hạn từ server nên có thể rất dài theo thời gian, chỉ hiện 10 dòng/trang.
  const HISTORY_PAGE_SIZE = 10;
  const [historyPage, setHistoryPage] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pending, approved, history] = await Promise.all([
        fetchPendingExams(),
        fetchApprovedExams(),
        fetchExamHistory(),
      ]);
      setPendingExams(Array.isArray(pending) ? pending : []);
      setApprovedExams(Array.isArray(approved) ? approved : []);
      setHistoryExams(Array.isArray(history) ? history : []);
      setHistoryPage(1);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Dùng chung cho handleApprove/handleReject/handleArchive bên dưới — khi
  // action bị chặn vì kỳ thi không còn ở trạng thái mong đợi nữa (thường do
  // đã bị thao tác từ 1 tab/thiết bị khác đang mở song song), tự tải lại 3
  // danh sách để tìm đúng trạng thái THẬT hiện tại của kỳ thi đó, rồi ghép
  // vào thông báo lỗi cho rõ ràng, thay vì chỉ hiện message chung chung của
  // backend khiến người dùng phải tự đoán vì sao thao tác bị từ chối.
  const reportStaleStatusError = async (id, fallbackMessage) => {
    const [pending, approved, history] = await Promise.all([
      fetchPendingExams().catch(() => []),
      fetchApprovedExams().catch(() => []),
      fetchExamHistory().catch(() => []),
    ]);
    const freshExam = [...pending, ...approved, ...history].find((e) => e._id === id);
    const statusText = freshExam ? STATUS_TEXT_LABELS[freshExam.status] || freshExam.status : null;

    showToast(
      statusText
        ? `Kỳ thi này đã ở trạng thái "${statusText}" (có thể vừa được thao tác từ tab hoặc thiết bị khác) nên không thể thực hiện thao tác này nữa. Danh sách đã được tải lại cho đúng trạng thái mới nhất.`
        : fallbackMessage,
      'warning',
    );
    loadData();
  };

  const handleApprove = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Chặn ngay ở giao diện: bắt đầu phải từ hiện tại trở đi, kết thúc phải sau bắt đầu (server cũng kiểm tra lại)
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!startDate || !endDate || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setDateError('Vui lòng chọn đầy đủ thời gian bắt đầu và kết thúc.');
      return;
    }
    if (start.getTime() < Date.now() - START_TOLERANCE_MS) {
      setDateError('Thời gian bắt đầu phải từ thời điểm hiện tại trở đi.');
      return;
    }
    if (end <= start) {
      setDateError('Thời gian kết thúc phải sau thời gian bắt đầu.');
      return;
    }
    setDateError('');

    setIsSubmitting(true);
    try {
      // Gửi mốc thời gian đã kèm múi giờ (ISO) để server hiểu đúng giờ đã chọn, không phụ thuộc múi giờ máy chủ.
      await approveExam(approveId, { startDate: start.toISOString(), endDate: end.toISOString() });
      setIsApproveModalOpen(false);
      setStartDate('');
      setEndDate('');
      showToast('Đã phê duyệt kỳ thi thành công.', 'success');
      loadData();
    } catch (error) {
      if (error.code === 'EXAM_INVALID_STATUS') {
        setIsApproveModalOpen(false);
        await reportStaleStatusError(approveId, error.message || 'Lỗi khi duyệt kỳ thi');
        return;
      }
      if (error.code === 'EXAM_DATES_INVALID' || error.code === 'EXAM_DATES_REQUIRED') {
        setDateError(error.message);
        return;
      }
      showToast(error.message || 'Lỗi khi duyệt kỳ thi', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await rejectExam(rejectId, rejectReason);
      setIsRejectModalOpen(false);
      setRejectReason('');
      showToast('Đã từ chối đề xuất kỳ thi.', 'warning');
      loadData();
    } catch (error) {
      if (error.code === 'EXAM_INVALID_STATUS') {
        setIsRejectModalOpen(false);
        await reportStaleStatusError(rejectId, error.message || 'Lỗi khi từ chối kỳ thi');
        return;
      }
      showToast(error.message || 'Lỗi khi từ chối kỳ thi', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublish = async (id) => {
    const ok = await confirmAction(
      'Bạn có chắc chắn muốn đăng chính thức kỳ thi này? Kỳ thi đang diễn ra (nếu có) sẽ bị lưu trữ.',
      { title: 'Đăng chính thức kỳ thi', confirmLabel: 'Đăng chính thức', danger: false }
    );
    if (!ok) return;
    setPublishingId(id);
    try {
      // Đang có thí sinh làm bài ở kỳ thi hiện tại? Đăng kỳ thi mới sẽ kết thúc kỳ thi đó ngay -> bắt buộc xác nhận lần 2.
      const confirmForce = (info) =>
        confirmAction(
          `Hiện có ${info?.activeAttemptCount ?? 'một số'} thí sinh đang làm bài` +
            (info?.currentExams?.length ? ` trong kỳ thi "${info.currentExams.map((e) => e.title).join('", "')}"` : '') +
            '. Nếu đăng kỳ thi mới bây giờ, kỳ thi này sẽ bị lưu trữ ngay và các thí sinh đó sẽ KHÔNG nộp được bài (bài làm dở có thể bị mất). Bạn có chắc chắn vẫn muốn đăng?',
          { title: 'Còn thí sinh đang làm bài', confirmLabel: 'Vẫn đăng chính thức', danger: true },
        );

      const impact = await fetchPublishImpact(id).catch(() => null);
      let force = false;
      if (impact?.activeAttemptCount > 0) {
        if (!(await confirmForce(impact))) return;
        force = true;
      }

      try {
        await publishExam(id, { force });
      } catch (err) {
        // Có thí sinh vừa vào thi sau lúc kiểm tra: hỏi lại với số liệu mới nhất rồi mới ép đăng.
        if (err.code === 'EXAM_PUBLISH_ACTIVE_ATTEMPTS' && !force) {
          const latest = await fetchPublishImpact(id).catch(() => null);
          if (!(await confirmForce(latest ?? impact))) return;
          await publishExam(id, { force: true });
        } else {
          throw err;
        }
      }
      showToast('Đã đăng chính thức kỳ thi.', 'success');
      loadData();
    } catch (error) {
      // Đề đã được thao tác ở nơi khác (đăng xong / bị bỏ qua) -> báo đúng trạng thái thật, KHÔNG bảo bấm lại.
      if (error.code === 'EXAM_INVALID_STATUS') {
        await reportStaleStatusError(id, error.message || 'Lỗi khi đăng chính thức');
        return;
      }
      // Đề đã quá thời gian kết thúc (duyệt từ trước) -> báo rõ, không bảo bấm lại.
      if (error.code === 'EXAM_DATES_EXPIRED') {
        showToast(error.message, 'error');
        return;
      }
      // Đang có Người duyệt đề khác phát hành đúng kỳ thi này.
      if (error.code === 'EXAM_PUBLISH_IN_PROGRESS' || error.code === 'EXAM_CONFLICT' || error.code === 'EXAM_PUBLISH_CONFLICT') {
        showToast(error.message, 'warning');
        loadData();
        return;
      }
      // Publish có thể đã xử lý được MỘT PHẦN trước khi lỗi xảy ra (vd mất
      // mạng giữa chừng lúc đang sinh mã đề/gán thí sinh) — kỳ thi khi đó vẫn
      // ở trạng thái "approved" (chưa published), an toàn để bấm lại. Ghi rõ
      // hướng xử lý ngay trong thông báo lỗi, tránh Leader hiểu nhầm là chưa
      // làm gì và bỏ qua không xử lý tiếp.
      showToast(
        `${error.message || 'Lỗi khi đăng chính thức'} — Vui lòng bấm "Đăng chính thức" lại để đảm bảo đầy đủ dữ liệu.`,
        'error',
      );
      // Load lại danh sách để Leader thấy đúng trạng thái mới nhất từ server,
      // tránh thao tác dựa trên dữ liệu cũ hiển thị trên màn hình.
      loadData();
    } finally {
      setPublishingId(null);
    }
  };

  const handleArchive = async (id) => {
    const ok = await confirmAction(
      'Bỏ qua kỳ thi này? Kỳ thi sẽ được lưu trữ và không thể phát hành nữa.',
      { title: 'Bỏ qua kỳ thi', confirmLabel: 'Bỏ qua' }
    );
    if (!ok) return;
    setArchivingId(id);
    try {
      await archiveExam(id);
      showToast('Đã lưu trữ kỳ thi.', 'success');
      loadData();
    } catch (error) {
      if (error.code === 'EXAM_INVALID_STATUS') {
        await reportStaleStatusError(id, error.message || 'Lỗi khi bỏ qua kỳ thi');
      } else if (error.code === 'EXAM_PUBLISH_IN_PROGRESS' || error.code === 'EXAM_CONFLICT') {
        showToast(error.message, 'warning');
        loadData();
      } else {
        showToast(error.message || 'Lỗi khi bỏ qua kỳ thi', 'error');
      }
    } finally {
      setArchivingId(null);
    }
  };

  const openApprove = (id) => {
    setApproveId(id);
    setStartDate('');
    setEndDate('');
    setDateError('');
    setMinStart(toLocalInputValue(new Date()));
    setIsApproveModalOpen(true);
  };

  const openReject = (id) => {
    setRejectId(id);
    setIsRejectModalOpen(true);
  };

  return (
    <div className="space-y-8">

      {/* Pending Exams */}
      <div>
        <h2 className="text-lg font-bold text-[#0F172A] mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-[#F6AD37]" />
          Đề xuất chờ duyệt
        </h2>

        {loading ? (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-base text-[#64748B]">Đang tải...</div>
        ) : pendingExams.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-base text-[#64748B]">
            Không có đề xuất nào đang chờ duyệt
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="animate-fade-in-up hidden sm:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden" style={{ '--stagger-delay': '0ms' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-[#F6F8FA] text-[#334155] text-base border-b border-[#E2E8F0]">
                    <tr>
                      <th className="p-4 font-semibold">Kỳ thi</th>
                      <th className="p-4 font-semibold">Chủ đề</th>
                      <th className="p-4 font-semibold">Cấu trúc</th>
                      <th className="p-4 font-semibold text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-base">
                    {pendingExams.map(exam => (
                      <tr key={exam._id} className="hover:bg-[#F6F8FA] transition-colors">
                        <td className="p-4 font-medium text-[#0F172A]">{exam.title}</td>
                        <td className="p-4 text-[#334155]">{exam.topicId?.name}</td>
                        <td className="p-4 text-[#334155] text-sm">
                          <div>Tgian: {exam.durationMinutes}p | Qua: {exam.passThresholdPercent}%</div>
                          <div>Tổng câu: {exam.totalQuestions} (Chung: {exam.commonQuestionCount}, Riêng: {exam.departmentQuestionCount})</div>
                          <div>Bù câu chung: {exam.allowCommonCompensation === false ? 'Tắt (phòng thiếu câu riêng bị khóa)' : 'Bật (thiếu câu riêng thì bù câu chung)'}</div>
                          <div>
                            Phạm vi:{' '}
                            <span className="font-medium text-slate-700">
                              {exam.departmentScope === 'selected'
                                ? (exam.allowedDepartmentIds ?? [])
                                    .map((d) => (typeof d === 'object' && d?.name ? d.name : null))
                                    .filter(Boolean)
                                    .join(', ') || 'Chỉ định phòng ban'
                                : 'Tất cả phòng ban'}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => openReject(exam._id)} className="px-3 py-2 bg-[#FEECEC] hover:bg-[#FDD8D8] text-[#C53030] font-semibold rounded-lg transition-colors text-sm min-touch-target">
                              Từ chối
                            </button>
                            <button onClick={() => openApprove(exam._id)} className="px-3 py-2 bg-[#F0FDF4] hover:bg-[#DCFCE7] text-[#166534] font-semibold rounded-lg transition-colors text-sm min-touch-target">
                              Phê duyệt
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card List */}
            <div className="animate-fade-in-up sm:hidden space-y-3" style={{ '--stagger-delay': '0ms' }}>
              {pendingExams.map(exam => (
                <div key={exam._id} className="bg-white p-4 rounded-xl border border-[#E2E8F0] space-y-3">
                  <div>
                    <div className="font-bold text-[#0F172A] text-base">{exam.title}</div>
                    <div className="text-base text-[#64748B]">{exam.topicId?.name}</div>
                  </div>
                  <div className="text-sm text-[#334155] bg-[#F6F8FA] rounded-lg p-2.5 space-y-0.5">
                    <div>Thời gian: {exam.durationMinutes} phút · Qua: {exam.passThresholdPercent}%</div>
                    <div>Tổng câu: {exam.totalQuestions} (Chung: {exam.commonQuestionCount}, Riêng: {exam.departmentQuestionCount})</div>
                    <div>Bù câu chung: {exam.allowCommonCompensation === false ? 'Tắt (phòng thiếu câu riêng bị khóa)' : 'Bật (thiếu câu riêng thì bù câu chung)'}</div>
                    <div>
                      Phạm vi:{' '}
                      <span className="font-medium text-slate-700">
                        {exam.departmentScope === 'selected'
                          ? (exam.allowedDepartmentIds ?? [])
                              .map((d) => (typeof d === 'object' && d?.name ? d.name : null))
                              .filter(Boolean)
                              .join(', ') || 'Chỉ định phòng ban'
                          : 'Tất cả phòng ban'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openReject(exam._id)} className="flex-1 h-11 bg-[#FEECEC] hover:bg-[#FDD8D8] text-[#C53030] font-semibold rounded-lg transition-colors text-base min-touch-target">
                      Từ chối
                    </button>
                    <button onClick={() => openApprove(exam._id)} className="flex-1 h-11 bg-[#F0FDF4] hover:bg-[#DCFCE7] text-[#166534] font-semibold rounded-lg transition-colors text-base min-touch-target">
                      Phê duyệt
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Approved Exams */}
      <div>
        <h2 className="text-lg font-bold text-[#0F172A] mb-4 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-[#22C55E]" />
          Kỳ thi đã duyệt (Chờ phát hành)
        </h2>

        {loading ? (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-base text-[#64748B]">Đang tải...</div>
        ) : approvedExams.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-base text-[#64748B]">
            Không có kỳ thi nào đang chờ phát hành
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="animate-fade-in-up hidden sm:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden" style={{ '--stagger-delay': '100ms' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-[#F6F8FA] text-[#334155] text-base border-b border-[#E2E8F0]">
                    <tr>
                      <th className="p-4 font-semibold">Kỳ thi</th>
                      <th className="p-4 font-semibold">Chủ đề</th>
                      <th className="p-4 font-semibold">Thời gian diễn ra</th>
                      <th className="p-4 font-semibold text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-base">
                    {approvedExams.map(exam => (
                      <tr key={exam._id} className="hover:bg-[#F6F8FA] transition-colors">
                        <td className="p-4 font-medium text-[#0F172A]">{exam.title}</td>
                        <td className="p-4 text-[#334155]">{exam.topicId?.name}</td>
                        <td className="p-4 text-[#334155] text-sm">
                          <div>Bắt đầu: {new Date(exam.startDate).toLocaleString('vi-VN')}</div>
                          <div>Kết thúc: {new Date(exam.endDate).toLocaleString('vi-VN')}</div>
                          {new Date(exam.endDate).getTime() <= Date.now() && (
                            <div className="font-semibold text-[#C53030]">Đã quá thời gian kết thúc</div>
                          )}
                          <div>
                            Phạm vi:{' '}
                            <span className="font-medium text-slate-700">
                              {exam.departmentScope === 'selected'
                                ? (exam.allowedDepartmentIds ?? [])
                                    .map((d) => (typeof d === 'object' && d?.name ? d.name : null))
                                    .filter(Boolean)
                                    .join(', ') || 'Chỉ định phòng ban'
                                : 'Tất cả phòng ban'}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2 justify-end items-center">
                            <button
                              onClick={() => handleArchive(exam._id)}
                              disabled={archivingId === exam._id || publishingId === exam._id}
                              className="px-3 py-2 bg-[#F6F8FA] hover:bg-[#E2E8F0] text-[#334155] font-semibold rounded-lg transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed min-touch-target"
                            >
                              {archivingId === exam._id ? 'Đang xử lý...' : 'Bỏ qua'}
                            </button>
                            <button
                              onClick={() => handlePublish(exam._id)}
                              disabled={publishingId === exam._id || archivingId === exam._id}
                              className="px-3 py-2 bg-[#008BC5] hover:bg-[#0693E3] text-white font-semibold rounded-lg transition-colors flex items-center gap-1.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed min-touch-target"
                            >
                              <Globe className="w-4 h-4" />
                              {publishingId === exam._id ? 'Đang đăng...' : 'Đăng chính thức'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card List */}
            <div className="animate-fade-in-up sm:hidden space-y-3" style={{ '--stagger-delay': '100ms' }}>
              {approvedExams.map(exam => (
                <div key={exam._id} className="bg-white p-4 rounded-xl border border-[#E2E8F0] space-y-3">
                  <div>
                    <div className="font-bold text-[#0F172A] text-base">{exam.title}</div>
                    <div className="text-base text-[#64748B]">{exam.topicId?.name}</div>
                  </div>
                  <div className="text-sm text-[#334155] bg-[#F6F8FA] rounded-lg p-2.5 space-y-0.5">
                    <div>Bắt đầu: {new Date(exam.startDate).toLocaleString('vi-VN')}</div>
                    <div>Kết thúc: {new Date(exam.endDate).toLocaleString('vi-VN')}</div>
                    {new Date(exam.endDate).getTime() <= Date.now() && (
                      <div className="font-semibold text-[#C53030]">Đã quá thời gian kết thúc</div>
                    )}
                    <div>
                      Phạm vi:{' '}
                      <span className="font-medium text-slate-700">
                        {exam.departmentScope === 'selected'
                          ? (exam.allowedDepartmentIds ?? [])
                              .map((d) => (typeof d === 'object' && d?.name ? d.name : null))
                              .filter(Boolean)
                              .join(', ') || 'Chỉ định phòng ban'
                          : 'Tất cả phòng ban'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleArchive(exam._id)}
                      disabled={archivingId === exam._id || publishingId === exam._id}
                      className="flex-1 h-11 bg-[#F6F8FA] hover:bg-[#E2E8F0] text-[#334155] font-semibold rounded-lg transition-colors text-base disabled:opacity-60 disabled:cursor-not-allowed min-touch-target"
                    >
                      {archivingId === exam._id ? 'Đang xử lý...' : 'Bỏ qua'}
                    </button>
                    <button
                      onClick={() => handlePublish(exam._id)}
                      disabled={publishingId === exam._id || archivingId === exam._id}
                      className="flex-1 h-11 bg-[#008BC5] hover:bg-[#0693E3] text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 text-base disabled:opacity-60 disabled:cursor-not-allowed min-touch-target"
                    >
                      <Globe className="w-4 h-4" />
                      {publishingId === exam._id ? 'Đang đăng...' : 'Đăng chính thức'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Lịch sử duyệt kỳ thi — không xóa dấu vết sau khi Duyệt/Từ chối/Đăng chính thức/Bỏ qua */}
      <div>
        <h2 className="text-lg font-bold text-[#0F172A] mb-4 flex items-center gap-2">
          <History className="w-5 h-5 text-[#64748B]" />
          Lịch sử duyệt kỳ thi
        </h2>

        {(() => {
          const totalHistoryPages = Math.max(1, Math.ceil(historyExams.length / HISTORY_PAGE_SIZE));
          const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
          const pagedHistoryExams = historyExams.slice(
            (safeHistoryPage - 1) * HISTORY_PAGE_SIZE,
            safeHistoryPage * HISTORY_PAGE_SIZE,
          );
          return (

        loading ? (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-base text-[#64748B]">Đang tải...</div>
        ) : historyExams.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-base text-[#64748B]">
            Chưa có kỳ thi nào được xử lý
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="animate-fade-in-up hidden sm:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden" style={{ '--stagger-delay': '200ms' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-left table-fixed">
                  <colgroup>
                    <col className="w-[26%]" />
                    <col className="w-[18%]" />
                    <col className="w-[14%]" />
                    <col className="w-[16%]" />
                    <col className="w-[26%]" />
                  </colgroup>
                  <thead className="bg-[#F6F8FA] text-[#334155] text-base border-b border-[#E2E8F0]">
                    <tr>
                      <th className="p-4 font-semibold">Kỳ thi</th>
                      <th className="p-4 font-semibold">Chủ đề</th>
                      <th className="p-4 font-semibold">Trạng thái</th>
                      <th className="p-4 font-semibold">Thời gian xử lý</th>
                      <th className="p-4 font-semibold">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-base">
                    {pagedHistoryExams.map(exam => {
                      const processedAt = exam.publishedAt || exam.approvedAt || exam.updatedAt || exam.createdAt;
                      return (
                        <tr key={exam._id} className="hover:bg-[#F6F8FA] transition-colors">
                          <td className="p-4 font-medium text-[#0F172A] truncate" title={exam.title}>{exam.title}</td>
                          <td className="p-4 text-[#334155] truncate" title={exam.topicId?.name}>{exam.topicId?.name}</td>
                          <td className="p-4">
                            <StatusBadge status={exam.status} />
                          </td>
                          <td className="p-4 text-[#334155] text-sm">
                            {processedAt ? new Date(processedAt).toLocaleString('vi-VN') : '—'}
                          </td>
                          <td className="p-4 text-sm break-words">
                            {exam.status === 'rejected' ? (
                              <span className="text-[#C53030]">{exam.rejectionReason || 'Không có lý do'}</span>
                            ) : exam.status === 'archived' ? (
                              <span className="flex items-center gap-1 text-[#64748B]">
                                <Archive className="w-4 h-4 shrink-0" /> <span className="truncate">Đã bị thay thế bởi kỳ thi khác hoặc bị bỏ qua</span>
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card List */}
            <div className="animate-fade-in-up sm:hidden space-y-3" style={{ '--stagger-delay': '200ms' }}>
              {pagedHistoryExams.map(exam => {
                const processedAt = exam.publishedAt || exam.approvedAt || exam.updatedAt || exam.createdAt;
                return (
                  <div key={exam._id} className="bg-white p-4 rounded-xl border border-[#E2E8F0] space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-[#0F172A] text-base">{exam.title}</div>
                        <div className="text-base text-[#64748B]">{exam.topicId?.name}</div>
                      </div>
                      <StatusBadge status={exam.status} />
                    </div>
                    <div className="text-sm text-[#64748B]">
                      {processedAt ? new Date(processedAt).toLocaleString('vi-VN') : '—'}
                    </div>
                    {exam.status === 'rejected' && (
                      <div className="text-sm text-[#C53030] bg-[#FEECEC] rounded-lg p-2.5">
                        Lý do: {exam.rejectionReason || 'Không có lý do'}
                      </div>
                    )}
                    {exam.status === 'archived' && (
                      <div className="flex items-center gap-1.5 text-sm text-[#64748B]">
                        <Archive className="w-4 h-4 shrink-0" /> Đã bị thay thế bởi kỳ thi khác hoặc bị bỏ qua
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Phân trang: 10 dòng/trang */}
            {totalHistoryPages > 1 && (
              <div className="flex items-center justify-between gap-3 mt-4 text-sm text-[#334155]">
                <span>
                  Trang {safeHistoryPage}/{totalHistoryPages} · {historyExams.length} kỳ thi
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                    disabled={safeHistoryPage <= 1}
                    className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F6F8FA] min-touch-target"
                  >
                    Trước
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}
                    disabled={safeHistoryPage >= totalHistoryPages}
                    className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F6F8FA] min-touch-target"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </>
        )
        );
        })()}
      </div>

      {/* Modals — render qua portal vào document.body: nếu để nằm trong cây của tab thì `fixed` bị neo theo
          phần tử cha có animation/transform (animate-fade-in-up) của dashboard, khiến lớp phủ chỉ phủ vùng
          nội dung tab và hộp thoại bị căn giữa ở GIỮA CẢ TRANG DÀI -> nằm ngoài màn hình, không thấy ô chọn thời gian. */}

      {/* Approve Modal */}
      {isApproveModalOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90dvh] overflow-hidden border border-slate-100 flex flex-col my-auto" data-lenis-prevent>
            <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-lg text-[#0F172A]">Phê duyệt đề xuất kỳ thi</h3>
              <button
                onClick={() => setIsApproveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 -mr-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleApprove} noValidate className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Thời gian bắt đầu</label>
                <input
                  required
                  type="datetime-local"
                  min={minStart}
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setDateError(''); }}
                  className="w-full p-2.5 text-base border border-slate-300 rounded-lg focus:border-[#008BC5] outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Thời gian kết thúc</label>
                <input
                  required
                  type="datetime-local"
                  min={startDate || minStart}
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setDateError(''); }}
                  className="w-full p-2.5 text-base border border-slate-300 rounded-lg focus:border-[#008BC5] outline-none"
                />
              </div>
              {dateError && (
                <p role="alert" className="text-sm font-medium text-[#C53030] bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg px-3 py-2">
                  {dateError}
                </p>
              )}
              <div className="pt-2 flex gap-3 pb-1">
                <button
                  type="button"
                  onClick={() => setIsApproveModalOpen(false)}
                  className="flex-1 py-3 min-h-[46px] border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 min-h-[46px] bg-[#008BC5] text-white rounded-lg font-semibold hover:bg-[#007ba1] active:bg-[#007ba1] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Đang xử lý...' : 'Xác nhận duyệt'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Reject Modal */}
      {isRejectModalOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90dvh] overflow-hidden border border-slate-100 flex flex-col my-auto" data-lenis-prevent>
            <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-lg text-[#0F172A]">Từ chối đề xuất kỳ thi</h3>
              <button
                onClick={() => setIsRejectModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 -mr-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReject} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Lý do từ chối</label>
                <textarea
                  required
                  rows="3"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Nhập lý do từ chối để Người ra đề chỉnh sửa lại..."
                  className="w-full p-2.5 text-base border border-slate-300 rounded-lg focus:border-[#008BC5] outline-none"
                />
              </div>
              <div className="pt-2 flex gap-3 pb-1">
                <button
                  type="button"
                  onClick={() => setIsRejectModalOpen(false)}
                  className="flex-1 py-3 min-h-[46px] border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 min-h-[46px] bg-[#E53E3E] text-white rounded-lg font-semibold hover:bg-red-700 active:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Đang xử lý...' : 'Từ chối'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
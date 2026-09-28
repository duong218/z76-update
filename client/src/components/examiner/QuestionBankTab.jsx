import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Edit2, Trash2, Loader2, X, Upload, Download, ChevronLeft, ChevronRight, ChevronDown, AlertCircle, AlertTriangle, CheckSquare, Square, Image as ImageIcon, FileSpreadsheet } from 'lucide-react';
import { fetchQuestions, fetchTopics, fetchDepartments, createQuestion, updateQuestion, deleteQuestion, previewImportQuestions, confirmImportQuestionsExcel, bulkDeleteQuestions, uploadQuestionImage } from '../../services/examiner.service';
import { useToast } from '../ToastContext';
import { useConfirm } from '../ConfirmDialog';
import { useScrollLock } from '../../hooks/useScrollLock';

// MỚI — Dropdown tự dựng dùng chung, thay cho toàn bộ thẻ <select> native
// trong file này. Danh sách xổ xuống của <select> do OS/trình duyệt tự vẽ,
// không bị ràng buộc bởi layout của trang/modal cha nên hay bị tràn ra
// ngoài khung chứa hoặc lệch khỏi màn hình trên mobile. Component này tự đo
// khoảng trống còn lại trong viewport để quyết định mở xuống hay lật lên
// trên, và luôn giới hạn width/height trong phạm vi màn hình.
// options: [{ value, label }]; triggerClassName để giữ nguyên style/kích
// thước riêng của từng chỗ dùng (khác nhau giữa ô lọc và ô trong form).
function Select({ value, options, onChange, placeholder = '-- Chọn --', disabled = false, triggerClassName = '' }) {
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

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`text-left relative ${triggerClassName} ${disabled ? 'disabled:bg-slate-50 disabled:text-slate-400 cursor-not-allowed' : ''}`}
        style={{ color: disabled ? '#94A3B8' : value ? undefined : '#64748B' }}
      >
        <span className="block truncate pr-6">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none transition-transform"
          style={{ transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)' }}
        />
      </button>

      {open && !disabled && (
        <div
          className={`absolute z-20 w-full overflow-y-auto bg-white rounded-lg border border-slate-200 shadow-lg py-1 ${
            menuStyle.placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          style={{ maxHeight: `${menuStyle.maxHeight}px` }}
          data-lenis-prevent
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full text-left px-3.5 min-h-[40px] flex items-center text-sm"
              style={value === opt.value ? { backgroundColor: '#EAF6FF', color: '#008BC5', fontWeight: 600 } : { color: '#0F172A' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const QuestionBankTab = ({ initialFilter } = {}) => {
  const { showToast } = useToast();
  const confirmAction = useConfirm();
  const [questions, setQuestions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });

  // Filters State
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedScope, setSelectedScope] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [selectedAnswerType, setSelectedAnswerType] = useState('');

  // Chọn nhiều câu hỏi (checkbox) để xóa hàng loạt. Reset mỗi khi đổi trang/
  // bộ lọc để tránh giữ id của câu hỏi không còn hiển thị trên màn hình.
  const [selectedIds, setSelectedIds] = useState([]);

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);

  // Import Excel (bulk) state — 2 bước: preview (xem trước, chưa ghi DB) rồi
  // confirm (ghi thật) — xem handleImportFile / handleConfirmImport bên dưới.
  const [showImportGuide, setShowImportGuide] = useState(false);

  useScrollLock(isFormOpen || isImportOpen || showImportGuide);
  const [importLoading, setImportLoading] = useState(false); // đang upload + phân tích file (bước preview)
  const [importPreview, setImportPreview] = useState(null); // { token, totalRows, readyCount, duplicateCount, errorCount, missingDepartments, duplicates, ready, errors }
  const [importConfirming, setImportConfirming] = useState(false); // đang ghi thật (bước confirm)
  // Bản nháp các phòng ban còn thiếu: mỗi phần tử = { name, code, description,
  // include, codeLocked, descriptionLocked, rowCount }. codeLocked/descriptionLocked
  // = true khi giá trị đã lấy sẵn được từ file Excel -> không cho sửa tay.
  const [deptDrafts, setDeptDrafts] = useState([]);
  const [keepDupRows, setKeepDupRows] = useState([]); // rowIndex của các dòng trùng mà người dùng chọn "vẫn thêm mới"

  // Form State
  const [content, setContent] = useState('');
  const [questionKind, setQuestionKind] = useState('theory');
  const [answerType, setAnswerType] = useState('single');
  const [difficulty, setDifficulty] = useState('easy');
  const [scope, setScope] = useState('Common');
  const [topicId, setTopicId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageCloudinaryId, setImageCloudinaryId] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [answers, setAnswers] = useState([
    { content: '', isCorrect: false },
    { content: '', isCorrect: false },
    { content: '', isCorrect: false },
    { content: '', isCorrect: false }
  ]);

  // Giữ giá trị `search` mới nhất trong 1 ref — để loadData bên dưới luôn đọc
  // được search hiện tại mà KHÔNG cần liệt kê `search` vào dependency của
  // useCallback (đọc qua ref không kích hoạt exhaustive-deps). Nhờ vậy tránh
  // được việc gõ tìm kiếm làm loadData đổi tham chiếu -> effect tự chạy lại
  // theo từng phím gõ; ô tìm kiếm vẫn chỉ tải lại khi bấm tìm/enter
  // (xem handleSearchSubmit bên dưới).
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  // useCallback: giữ nguyên tham chiếu hàm loadData giữa các lần render (chỉ
  // đổi khi 1 trong các filter dưới đây đổi) — để useEffect kế tiếp có thể
  // khai báo loadData vào dependency array mà không gây loop vô hạn.
  const loadData = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const [questionsRes, topicsData, deptsData] = await Promise.all([
        fetchQuestions({
          page,
          limit: 10,
          search: searchRef.current,
          topicId: selectedTopic,
          scope: selectedScope,
          departmentId: selectedDept,
          difficulty: selectedDifficulty,
          answerType: selectedAnswerType
        }),
        fetchTopics(),
        fetchDepartments()
      ]);
      setQuestions(questionsRes.items);
      setPagination(questionsRes.pagination);
      setTopics(topicsData);
      setDepartments(deptsData);
    } catch (err) {
      setError(err.message || 'Lỗi tải ngân hàng câu hỏi');
    } finally {
      setLoading(false);
    }
  }, [selectedTopic, selectedScope, selectedDept, selectedDifficulty, selectedAnswerType]);

  useEffect(() => {
    setSelectedIds([]);
    loadData(1);
  }, [selectedTopic, selectedScope, selectedDept, selectedDifficulty, selectedAnswerType, loadData]);

  // Khi nhận filter từ bên ngoài (vd bấm "Xem câu hỏi" trên 1 thẻ chủ đề ở
  // tab Chủ đề, hoặc trên 1 thẻ bộ phận ở tab Bộ phận/Phòng ban), áp filter
  // đó vào ngân hàng câu hỏi. Dùng initialFilter?.ts (mốc thời gian) trong
  // dependency thay vì chỉ topicId/departmentId, để nếu người dùng bấm lại
  // đúng mục vừa xem, effect vẫn chạy lại (đảm bảo tab luôn được kéo về
  // đúng trạng thái đã lọc, kể cả khi giữa chừng người dùng đã tự đổi filter
  // khác đi).
  useEffect(() => {
    if (!initialFilter?.ts) return;
    if (initialFilter.topicId) setSelectedTopic(initialFilter.topicId);
    if (initialFilter.departmentId) {
      // Bấm "Xem câu hỏi" từ 1 bộ phận cụ thể -> chỉ muốn xem câu hỏi RIÊNG
      // của đúng bộ phận đó, không lẫn câu hỏi Chung -> khóa luôn scope, và
      // bỏ filter Chủ đề đang chọn dở (nếu có) để không lọc chồng nhầm ý.
      setSelectedTopic('');
      setSelectedDept(initialFilter.departmentId);
      setSelectedScope('DepartmentSpecific');
    }
  }, [initialFilter?.topicId, initialFilter?.departmentId, initialFilter?.ts]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadData(1);
  };

  const handleOpenAdd = () => {
    setEditingQuestion(null);
    setContent('');
    setQuestionKind('theory');
    setAnswerType('single');
    setDifficulty('easy');
    setScope('Common');
    setTopicId('');
    setDepartmentId('');
    setImageUrl('');
    setImageCloudinaryId('');
    setImagePreviewUrl('');
    setAnswers([
      { content: '', isCorrect: false },
      { content: '', isCorrect: false },
      { content: '', isCorrect: false },
      { content: '', isCorrect: false }
    ]);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (q) => {
    setEditingQuestion(q);
    setContent(q.content);
    setQuestionKind(q.questionKind || 'theory');
    setAnswerType(q.answerType || 'single');
    setDifficulty(q.difficulty || 'easy');
    setScope(q.scope || 'Common');
    setTopicId(q.topicId || '');
    setDepartmentId(q.departmentId || '');
    setImageUrl(q.imageUrl || '');
    setImageCloudinaryId(q.imageCloudinaryId || '');
    setImagePreviewUrl(q.imageUrl || '');
    // Mapping option responses to form structure
    const mappedAnswers = q.answers.map(a => ({
      id: a.id,
      content: a.content,
      isCorrect: a.isCorrect
    }));
    // Make sure there are at least 4 answers fields for better form layout
    while (mappedAnswers.length < 4) {
      mappedAnswers.push({ content: '', isCorrect: false });
    }
    setAnswers(mappedAnswers);
    setIsFormOpen(true);
  };

  const handleAnswerChange = (index, field, value) => {
    const nextAnswers = [...answers];
    if (field === 'isCorrect' && answerType === 'single') {
      // Toggle all others off
      nextAnswers.forEach((ans, i) => {
        ans.isCorrect = i === index ? value : false;
      });
    } else {
      nextAnswers[index][field] = value;
    }
    setAnswers(nextAnswers);
  };

  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const localPreview = URL.createObjectURL(file);
    setImagePreviewUrl(localPreview);
    setImageUploading(true);
    setError('');
    try {
      const res = await uploadQuestionImage(file);
      setImageUrl(res.imageUrl);
      setImageCloudinaryId(res.imageCloudinaryId);
      setImagePreviewUrl(res.imageUrl);
    } catch (err) {
      setError(err.message || 'Lỗi khi tải ảnh lên');
      setImagePreviewUrl(imageUrl || '');
    } finally {
      setImageUploading(false);
      URL.revokeObjectURL(localPreview);
    }
  };

  const handleRemoveImage = () => {
    setImageUrl('');
    setImageCloudinaryId('');
    setImagePreviewUrl('');
  };

  const addAnswerField = () => {
    if (answers.length >= 8) return; // Limit to 8 options
    setAnswers([...answers, { content: '', isCorrect: false }]);
  };

  const removeAnswerField = (index) => {
    if (answers.length <= 2) return; // Keep at least 2 options
    setAnswers(answers.filter((_, i) => i !== index));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!topicId) {
      setError('Vui lòng chọn chủ đề liên kết');
      return;
    }
    if (scope === 'DepartmentSpecific' && !departmentId) {
      setError('Vui lòng chọn bộ phận liên kết');
      return;
    }

    const filteredAnswers = answers.filter(a => a.content.trim() !== '');
    if (filteredAnswers.length < 2) {
      setError('Vui lòng điền ít nhất 2 phương án trả lời');
      return;
    }

    const correctCount = filteredAnswers.filter(a => a.isCorrect).length;
    if (answerType === 'single' && correctCount !== 1) {
      setError('Vui lòng chọn duy nhất 1 đáp án đúng cho câu hỏi Một đáp án.');
      return;
    }
    if (answerType === 'multiple' && correctCount < 1) {
      setError('Vui lòng chọn ít nhất 1 đáp án đúng cho câu hỏi Nhiều đáp án.');
      return;
    }

    setActionLoading(true);
    setError('');
    const payload = {
      content,
      questionKind,
      answerType,
      difficulty,
      scope,
      topicId,
      departmentId: scope === 'DepartmentSpecific' ? departmentId : undefined,
      answers: filteredAnswers
    };

    if (editingQuestion) {
      // Chỉ gửi imageUrl/imageCloudinaryId khi có thay đổi so với câu hỏi
      // gốc — gửi null nghĩa là "gỡ/thay ảnh, xoá ảnh cũ trên Cloudinary",
      // không gửi nghĩa là "giữ nguyên ảnh hiện có" (backend không đụng field).
      const originalCloudinaryId = editingQuestion.imageCloudinaryId || '';
      if (imageCloudinaryId !== originalCloudinaryId) {
        payload.imageUrl = imageUrl || null;
        payload.imageCloudinaryId = imageCloudinaryId || null;
      }
    } else {
      payload.imageUrl = imageUrl || undefined;
      payload.imageCloudinaryId = imageCloudinaryId || undefined;
    }

    try {
      if (editingQuestion) {
        await updateQuestion(editingQuestion.id, payload);
      } else {
        await createQuestion(payload);
      }
      setIsFormOpen(false);
      await loadData(pagination.page);
    } catch (err) {
      setError(err.message || 'Lỗi khi lưu câu hỏi');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id) => {
    const ok = await confirmAction('Bạn có chắc chắn muốn ngừng sử dụng câu hỏi này?', { title: 'Ngừng sử dụng câu hỏi', confirmLabel: 'Ngừng sử dụng' });
    if (!ok) return;
    setActionLoading(true);
    setError('');
    try {
      await deleteQuestion(id);
      await loadData(pagination.page);
    } catch (err) {
      const message = err.message || 'Lỗi khi xóa câu hỏi';
      setError(message);
      // Thêm toast lỗi song song với banner (đồng bộ pattern TopicTab.jsx) —
      // lỗi bị CHẶN (vd câu hỏi đang dùng cho kỳ thi published) cần nổi bật
      // ngay, tránh người dùng chỉ thấy nút hết loading rồi tưởng đã ngừng
      // sử dụng thành công mà không để ý banner ở đầu trang (đặc biệt khi
      // danh sách câu hỏi dài, banner nằm trên cùng dễ bị lướt qua).
      showToast(message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSelectId = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const allOnPageSelected = questions.length > 0 && questions.every((q) => selectedIds.includes(q.id));

  const toggleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !questions.some((q) => q.id === id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...questions.map((q) => q.id)])]);
    }
  };

  const handleBulkDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const ok = await confirmAction(
      `Bạn có chắc chắn muốn ngừng sử dụng ${selectedIds.length} câu hỏi đã chọn?`,
      { title: 'Ngừng sử dụng câu hỏi đã chọn', confirmLabel: 'Ngừng sử dụng' }
    );
    if (!ok) return;
    setActionLoading(true);
    setError('');
    try {
      const res = await bulkDeleteQuestions({ ids: selectedIds });
      setSelectedIds([]);
      await loadData(1);
      // res.skippedActiveExam khác null khi có câu hỏi bị GIỮ LẠI vì đang
      // dùng cho kỳ thi published (xem question.service.js/deactivateManyQuestions)
      // — dùng 'warning' (vàng) thay vì 'success' (xanh) vì đây không phải
      // thành công hoàn toàn như người dùng mong đợi khi chọn N câu để xóa.
      if (res.skippedActiveExam) {
        showToast(
          `Đã ngừng sử dụng ${res.deactivatedCount} câu hỏi. Giữ lại ${res.skippedActiveExam.skippedCount} câu vì đang được dùng cho kỳ thi "${res.skippedActiveExam.examTitle}" đang diễn ra — vui lòng đợi kỳ thi kết thúc rồi thử lại.`,
          'warning',
        );
      } else {
        showToast(`Đã ngừng sử dụng ${res.deactivatedCount} câu hỏi.`, 'success');
      }
    } catch (err) {
      const message = err.message || 'Lỗi khi xóa hàng loạt câu hỏi';
      setError(message);
      showToast(message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Xóa TOÀN BỘ câu hỏi khớp đúng bộ lọc đang áp dụng trên UI (không giới
  // hạn theo trang hiện tại) — tiện cho việc dọn dữ liệu test/trùng lặp.
  // Backend sẽ tự chặn nếu chưa chọn bộ lọc cụ thể nào (tránh xóa nhầm toàn
  // bộ ngân hàng câu hỏi).
  const handleDeleteAllByFilter = async () => {
    const hasFilter = selectedTopic || selectedScope || selectedDept || selectedDifficulty || selectedAnswerType || search.trim();
    if (!hasFilter) {
      showToast('Vui lòng chọn ít nhất 1 bộ lọc (chủ đề, phạm vi, bộ phận, độ khó, hình thức đáp án hoặc từ khóa tìm kiếm) trước khi xóa tất cả, để tránh xóa nhầm toàn bộ ngân hàng câu hỏi.', 'warning');
      return;
    }
    const ok = await confirmAction(
      `Bạn có chắc chắn muốn ngừng sử dụng TẤT CẢ ${pagination.total} câu hỏi đang khớp bộ lọc hiện tại (không chỉ trang này)? Hành động này áp dụng cho toàn bộ kết quả lọc, không thể hoàn tác qua giao diện.`,
      { title: 'Ngừng sử dụng tất cả theo bộ lọc', confirmLabel: 'Ngừng sử dụng tất cả' }
    );
    if (!ok) return;
    setActionLoading(true);
    setError('');
    try {
      const res = await bulkDeleteQuestions({
        filters: {
          topicId: selectedTopic,
          scope: selectedScope,
          departmentId: selectedDept,
          difficulty: selectedDifficulty,
          answerType: selectedAnswerType,
          search,
        },
      });
      setSelectedIds([]);
      await loadData(1);
      if (res.skippedActiveExam) {
        showToast(
          `Đã ngừng sử dụng ${res.deactivatedCount} câu hỏi khớp bộ lọc. Giữ lại ${res.skippedActiveExam.skippedCount} câu vì đang được dùng cho kỳ thi "${res.skippedActiveExam.examTitle}" đang diễn ra — vui lòng đợi kỳ thi kết thúc rồi thử lại.`,
          'warning',
        );
      } else {
        showToast(`Đã ngừng sử dụng ${res.deactivatedCount} câu hỏi khớp bộ lọc.`, 'success');
      }
    } catch (err) {
      const message = err.message || 'Lỗi khi xóa tất cả theo bộ lọc';
      setError(message);
      showToast(message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // BƯỚC 1/2 — Chọn file là phân tích ngay (chưa ghi DB): server trả về
  // phòng ban còn thiếu (để tạo ngay trong modal) và các câu trùng (để chọn
  // giữ câu cũ hay vẫn thêm câu mới).
  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportLoading(true);
    setError('');
    try {
      const data = await previewImportQuestions(file);
      setImportPreview(data);
      setDeptDrafts(
        (data.missingDepartments || []).map((d) => ({
          name: d.name,
          code: d.code || '',
          description: d.description || '',
          include: true, // mặc định tick tạo hết
          codeLocked: Boolean(d.code),
          descriptionLocked: Boolean(d.description),
          rowCount: d.rowCount || 0,
        })),
      );
      setKeepDupRows([]); // mặc định: câu trùng bị bỏ qua, giữ câu cũ
      setIsImportOpen(false);
      setShowImportGuide(false);
    } catch (err) {
      setError(err.message || 'Xem trước file Excel thất bại');
    } finally {
      setImportLoading(false);
      e.target.value = '';
    }
  };

  const closeImportPreview = () => {
    setImportPreview(null);
    setDeptDrafts([]);
    setKeepDupRows([]);
  };

  const toggleDeptInclude = (name) => {
    setDeptDrafts((prev) => prev.map((d) => (d.name === name ? { ...d, include: !d.include } : d)));
  };

  const updateDeptField = (name, field, value) => {
    setDeptDrafts((prev) => prev.map((d) => (d.name === name ? { ...d, [field]: value } : d)));
  };

  // Số câu hỏi sẽ "cứu" được thêm nhờ các bộ phận đang được tick tạo VÀ đã
  // điền đủ mã + mô tả — dùng để hiển thị đúng số câu trên nút xác nhận,
  // và để chặn xác nhận khi còn thiếu thông tin.
  const includedDeptRowCount = deptDrafts
    .filter((d) => d.include && d.code.trim() && d.description.trim())
    .reduce((sum, d) => sum + d.rowCount, 0);

  const hasIncompleteIncludedDept = deptDrafts.some(
    (d) => d.include && (!d.code.trim() || !d.description.trim()),
  );

  const toggleKeepDupRow = (row) => {
    setKeepDupRows((prev) => (prev.includes(row) ? prev.filter((r) => r !== row) : [...prev, row]));
  };

  // BƯỚC 2/2 — Xác nhận: tạo các phòng ban đã tick + ghi thật câu hỏi vào DB
  // (câu trùng chỉ được thêm nếu dòng đó nằm trong keepDupRows).
  const handleConfirmImport = async () => {
    if (!importPreview) return;
    // Chặn ngay trên UI: bộ phận đang tick tạo mà chưa nhập đủ mã + mô tả sẽ
    // khiến server lỗi khi tạo phòng ban -> nhắc điền đủ hoặc bỏ tick, thay vì
    // để lỗi bay lên sau khi bấm xác nhận.
    if (hasIncompleteIncludedDept) {
      setError('Vui lòng nhập đủ mã và mô tả cho các bộ phận đang tạo, hoặc bỏ tick "Tạo bộ phận này" để bỏ qua.');
      return;
    }
    setImportConfirming(true);
    setError('');
    try {
      const res = await confirmImportQuestionsExcel({
        token: importPreview.token,
        createDepartments: deptDrafts
          .filter((d) => d.include)
          .map((d) => ({ name: d.name, code: d.code.trim(), description: d.description.trim() })),
        keepDuplicateRows: keepDupRows,
      });
      showToast(
        `Import xong: ${res.imported} thành công, ${res.skipped} bỏ qua (trùng), ${res.failed} lỗi.`,
        res.failed > 0 ? 'warning' : 'success',
      );
      setImportPreview(null);
      setDeptDrafts([]);
      setKeepDupRows([]);
      await loadData(1);
    } catch (err) {
      setError(err.message || 'Import thất bại (phiên xem trước có thể đã hết hạn, hãy tải file lên lại)');
    } finally {
      setImportConfirming(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Toolbar & Filters */}
      {/* MỚI — animate-fade-in-up: đồng bộ hiệu ứng xuất hiện khi tab vừa tải
          xong, cùng pattern với AccountTab.jsx bên Admin. */}
      <div className="animate-fade-in-up bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4" style={{ '--stagger-delay': '0ms' }}>
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Tìm kiếm nội dung câu hỏi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 min-h-[44px] text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5]"
            />
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          <button type="submit" className="px-5 py-2.5 min-h-[44px] bg-[#008BC5] text-white rounded-lg font-medium hover:bg-[#007ba1] active:bg-[#007ba1] transition-colors">
            Tìm kiếm
          </button>
        </form>

        {/* Bộ lọc — 2 cột trên mobile để mỗi ô chọn còn đủ rộng, có thể cuộn
            ngang danh sách khi mở dropdown; enlarge padding cho dễ chạm. */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
          <Select
            value={selectedTopic}
            onChange={setSelectedTopic}
            placeholder="-- Tất cả chủ đề --"
            options={topics.map(t => ({ value: t._id, label: t.name }))}
            triggerClassName="w-full px-3 py-2.5 min-h-[42px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white text-sm"
          />

          <Select
            value={selectedScope}
            onChange={setSelectedScope}
            placeholder="-- Phạm vi --"
            options={[
              { value: 'Common', label: 'Chung' },
              { value: 'DepartmentSpecific', label: 'Riêng bộ phận' },
            ]}
            triggerClassName="w-full px-3 py-2.5 min-h-[42px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white text-sm"
          />

          <Select
            value={selectedDept}
            onChange={setSelectedDept}
            disabled={selectedScope !== 'DepartmentSpecific'}
            placeholder="-- Bộ phận --"
            options={departments.map(d => ({ value: d._id, label: d.name }))}
            triggerClassName="w-full px-3 py-2.5 min-h-[42px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white text-sm"
          />

          <Select
            value={selectedDifficulty}
            onChange={setSelectedDifficulty}
            placeholder="-- Độ khó --"
            options={[
              { value: 'easy', label: 'Dễ' },
              { value: 'medium', label: 'Trung bình' },
              { value: 'hard', label: 'Khó' },
            ]}
            triggerClassName="w-full px-3 py-2.5 min-h-[42px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white text-sm"
          />

          <div className="col-span-2 md:col-span-1">
            <Select
              value={selectedAnswerType}
              onChange={setSelectedAnswerType}
              placeholder="-- Hình thức đáp án --"
              options={[
                { value: 'single', label: 'Một đáp án (Single)' },
                { value: 'multiple', label: 'Nhiều đáp án (Multiple)' },
              ]}
              triggerClassName="w-full px-3 py-2.5 min-h-[42px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-between items-center pt-2 gap-3 border-t border-slate-100">
          <div className="text-sm text-slate-500 font-medium">Tổng cộng: {pagination.total} câu hỏi</div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setIsImportOpen(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Import Excel</span>
            </button>
            <button
              onClick={handleOpenAdd}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-[#008BC5] text-white rounded-lg font-medium hover:bg-[#007ba1] active:bg-[#007ba1] transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm câu hỏi</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bulk actions bar */}
      {questions.length > 0 && (
        <div className="animate-fade-in-up bg-white rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 text-sm" style={{ '--stagger-delay': '80ms' }}>
          <button
            type="button"
            onClick={toggleSelectAllOnPage}
            className="flex items-center gap-2 text-slate-600 hover:text-[#008BC5] font-medium py-1.5 min-h-[40px]"
          >
            {allOnPageSelected ? <CheckSquare className="w-4 h-4 text-[#008BC5]" /> : <Square className="w-4 h-4" />}
            {allOnPageSelected ? 'Bỏ chọn tất cả trang này' : 'Chọn tất cả trang này'}
            {selectedIds.length > 0 && <span className="text-slate-400 font-normal">({selectedIds.length} đã chọn)</span>}
          </button>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleBulkDeleteSelected}
              disabled={selectedIds.length === 0 || actionLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] border border-[#E53E3E]/40 text-[#E53E3E] rounded-lg font-medium hover:bg-[#FEECEC] active:bg-[#FEECEC] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Xóa {selectedIds.length > 0 ? `${selectedIds.length} câu đã chọn` : 'đã chọn'}
            </button>
            <button
              type="button"
              onClick={handleDeleteAllByFilter}
              disabled={actionLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-[#E53E3E] text-white rounded-lg font-medium hover:bg-[#C53030] active:bg-[#C53030] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Xóa toàn bộ câu hỏi khớp bộ lọc hiện tại, không chỉ trang này"
            >
              <Trash2 className="w-4 h-4" />
              Xóa tất cả theo bộ lọc ({pagination.total})
            </button>
          </div>
        </div>
      )}

      {/* List Questions */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-pulse space-y-3">
              <div className="h-6 w-3/4 bg-slate-200 rounded"></div>
              <div className="h-4 w-1/4 bg-slate-200 rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="animate-fade-in-up space-y-4" style={{ '--stagger-delay': '140ms' }}>
          {questions.map((q) => (
            <div key={q.id} className={`bg-white p-3.5 sm:p-5 rounded-xl border shadow-sm space-y-3.5 sm:space-y-4 hover:shadow-md transition-shadow ${selectedIds.includes(q.id) ? 'border-[#008BC5] ring-1 ring-[#008BC5]/30' : 'border-slate-200'}`}>
              <div className="flex justify-between items-start gap-2 sm:gap-4">
                <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleSelectId(q.id)}
                    className="shrink-0 text-slate-400 hover:text-[#008BC5] p-1.5 -m-1.5 min-h-[38px] min-w-[38px] flex items-center justify-center"
                    title="Chọn câu hỏi này"
                  >
                    {selectedIds.includes(q.id) ? <CheckSquare className="w-5 h-5 text-[#008BC5]" /> : <Square className="w-5 h-5" />}
                  </button>
                  <div className="space-y-2 min-w-0">
                  <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${q.difficulty === 'easy' ? 'bg-[#F0FDF4] text-[#16A34A]' :
                        q.difficulty === 'medium' ? 'bg-[#FFFBEB] text-[#B45309]' :
                          'bg-[#FEECEC] text-[#C53030]'
                      }`}>
                      {q.difficulty === 'easy' ? 'Dễ' : q.difficulty === 'medium' ? 'Trung bình' : 'Khó'}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-semibold">
                      {q.questionKind === 'theory' ? 'Lý thuyết' : 'Bài tập'}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-xs font-semibold">
                      {q.scope === 'Common' ? 'Chung' : 'Riêng bộ phận'}
                    </span>
                    {q.imageUrl && (
                      <span
                        title="Câu hỏi này có ảnh minh hoạ đề bài"
                        className="px-2 py-0.5 bg-sky-50 text-[#008BC5] rounded text-xs font-semibold flex items-center gap-1"
                      >
                        <ImageIcon className="w-3 h-3" />
                        Có ảnh
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-slate-800 text-[15px] sm:text-base leading-snug break-words">{q.content}</h4>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleOpenEdit(q)}
                    className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-500 hover:text-[#008BC5] hover:bg-blue-50 active:bg-blue-100 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(q.id)}
                    className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-500 hover:text-[#E53E3E] hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Answers list */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:pl-2">
                {q.answers.map((ans, idx) => (
                  <div key={ans.id || idx} className={`p-2.5 rounded-lg border text-sm flex items-start gap-2.5 ${ans.isCorrect ? 'bg-[#F0FDF4] border-[#22C55E]/40 text-[#0F172A]' : 'bg-slate-50/50 border-slate-100 text-slate-700'}`}>
                    <span className="font-semibold">{String.fromCharCode(65 + idx)}.</span>
                    <span className="flex-1 break-words">{ans.content}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {questions.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
              Không tìm thấy câu hỏi nào.
            </div>
          )}

          {/* Pagination */}
          {pagination.total > pagination.limit && (
            <div className="flex justify-between items-center pt-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => loadData(pagination.page - 1)}
                className="flex items-center gap-1 px-3.5 py-2.5 min-h-[44px] border border-slate-300 rounded-lg hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 text-sm font-medium"
              >
                <ChevronLeft className="w-4 h-4" /> Trước
              </button>
              <span className="text-sm font-medium text-slate-600">Trang {pagination.page}</span>
              <button
                disabled={pagination.page * pagination.limit >= pagination.total}
                onClick={() => loadData(pagination.page + 1)}
                className="flex items-center gap-1 px-3.5 py-2.5 min-h-[44px] border border-slate-300 rounded-lg hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 text-sm font-medium"
              >
                Sau <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* QUESTION FORM MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-2xl sm:my-8 max-h-[95vh] sm:max-h-[90vh] overflow-hidden border border-slate-100 flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-lg text-[#0F172A]">
                {editingQuestion ? 'Chỉnh sửa câu hỏi' : 'Thêm câu hỏi mới'}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 -mr-2 min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleFormSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto" data-lenis-prevent>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nội dung câu hỏi</label>
                <textarea
                  required
                  placeholder="Nhập nội dung câu hỏi..."
                  rows="3"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Loại nội dung</label>
                  <Select
                    value={questionKind}
                    onChange={setQuestionKind}
                    options={[
                      { value: 'theory', label: 'Lý thuyết' },
                      { value: 'practice', label: 'Bài tập thực hành' },
                    ]}
                    triggerClassName="w-full px-3.5 py-2.5 text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Độ khó</label>
                  <Select
                    value={difficulty}
                    onChange={setDifficulty}
                    options={[
                      { value: 'easy', label: 'Dễ' },
                      { value: 'medium', label: 'Trung bình' },
                      { value: 'hard', label: 'Khó' },
                    ]}
                    triggerClassName="w-full px-3.5 py-2.5 text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Hình thức đáp án</label>
                  <Select
                    value={answerType}
                    onChange={(val) => {
                      setAnswerType(val);
                      // Reset correct checks if switching to single
                      if (val === 'single') {
                        setAnswers(prev => prev.map((ans, idx) => ({ ...ans, isCorrect: idx === 0 })));
                      }
                    }}
                    options={[
                      { value: 'single', label: 'Một đáp án đúng (Single Choice)' },
                      { value: 'multiple', label: 'Nhiều đáp án đúng (Multiple Choice)' },
                    ]}
                    triggerClassName="w-full px-3.5 py-2.5 text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Chủ đề liên kết</label>
                  <Select
                    value={topicId}
                    onChange={setTopicId}
                    placeholder="-- Chọn chủ đề --"
                    options={topics.map(t => ({ value: t._id, label: t.name }))}
                    triggerClassName="w-full px-3.5 py-2.5 text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Phạm vi câu hỏi</label>
                  <Select
                    value={scope}
                    onChange={setScope}
                    options={[
                      { value: 'Common', label: 'Chung (Toàn nhà máy)' },
                      { value: 'DepartmentSpecific', label: 'Riêng bộ phận' },
                    ]}
                    triggerClassName="w-full px-3.5 py-2.5 text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Bộ phận liên kết</label>
                  <Select
                    disabled={scope !== 'DepartmentSpecific'}
                    value={departmentId}
                    onChange={setDepartmentId}
                    placeholder="-- Chọn bộ phận --"
                    options={departments.map(d => ({ value: d._id, label: d.name }))}
                    triggerClassName="w-full px-3.5 py-2.5 text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] bg-white disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Ảnh minh hoạ đề bài (không bắt buộc)</label>
                <div className="flex items-start gap-3">
                  {imagePreviewUrl && (
                    <div className="relative shrink-0">
                      <img src={imagePreviewUrl} alt="Xem trước ảnh câu hỏi" className="w-24 h-24 object-cover rounded-lg border border-slate-200" />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute -top-2 -right-2 bg-white border border-slate-300 rounded-full p-1 text-slate-500 hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/jpg"
                      onChange={handleImageFileChange}
                      disabled={imageUploading}
                      className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:text-sm file:font-medium hover:file:bg-slate-200"
                    />
                    <p className="text-xs text-slate-400 mt-1">JPG hoặc PNG, tối đa 10MB. Ảnh chỉ gắn ở đề bài, không gắn theo từng lựa chọn.</p>
                    {imageUploading && (
                      <p className="text-xs text-[#008BC5] mt-1 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Đang tải ảnh lên...
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Answers Area */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-semibold text-slate-700">Các phương án trả lời (Từ A đến H)</label>
                  {answers.length < 8 && (
                    <button
                      type="button"
                      onClick={addAnswerField}
                      className="text-xs font-semibold text-[#008BC5] hover:underline"
                    >
                      + Thêm phương án
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {answers.map((ans, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type={answerType === 'single' ? 'radio' : 'checkbox'}
                        name="correct_answer"
                        checked={ans.isCorrect}
                        onChange={(e) => handleAnswerChange(idx, 'isCorrect', e.target.checked)}
                        className="w-5 h-5 shrink-0 text-[#008BC5] focus:ring-[#008BC5]"
                      />
                      <span className="font-bold text-sm text-slate-500 w-4 shrink-0">{String.fromCharCode(65 + idx)}.</span>
                      <input
                        type="text"
                        placeholder={`Nhập phương án ${String.fromCharCode(65 + idx)}...`}
                        value={ans.content}
                        onChange={(e) => handleAnswerChange(idx, 'content', e.target.value)}
                        className="flex-1 min-w-0 px-3 py-2 text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5]"
                      />
                      {answers.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeAnswerField(idx)}
                          className="text-slate-400 hover:text-red-500 p-2 -m-1 min-h-[38px] min-w-[38px] flex items-center justify-center shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex gap-3 pb-1">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 py-3 min-h-[46px] border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-3 min-h-[46px] bg-[#008BC5] text-white rounded-lg font-semibold hover:bg-[#007ba1] active:bg-[#007ba1] transition-colors flex items-center justify-center gap-2 disabled:opacity-75"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Lưu câu hỏi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IMPORT EXCEL MODAL */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto border border-slate-100" data-lenis-prevent>
            <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 sticky top-0">
              <h3 className="font-bold text-lg text-[#0F172A]">Nhập câu hỏi từ file Excel</h3>
              <button
                onClick={() => setIsImportOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 -mr-2 min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              <a
                href="/templates/Mau_Import_Cau_Hoi_Z176.xlsx"
                download
                className="flex items-center justify-center gap-2 w-full py-3 min-h-[46px] border border-[#008BC5]/30 bg-[#EAF6FF] text-[#008BC5] rounded-lg font-semibold text-sm hover:bg-[#008BC5]/10 active:bg-[#008BC5]/10 transition-colors"
              >
                <Download className="w-4 h-4" />
                Tải file mẫu Excel (đúng định dạng cột)
              </a>

              {/* Panel xem nhanh cột bắt buộc — không cần mở file Excel cũng
                  biết được cấu trúc file cần có, hữu ích cho người dùng lần
                  đầu import (vd người kế nhiệm sau này không quen hệ thống). */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowImportGuide((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-semibold text-slate-700"
                >
                  <span>Xem nhanh: file Excel cần có cột gì?</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showImportGuide ? 'rotate-180' : ''}`} />
                </button>
                {showImportGuide && (
                  <div className="p-4 space-y-3 text-xs text-slate-600 bg-white">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="py-1.5 pr-2 font-semibold text-slate-700">Tên cột</th>
                          <th className="py-1.5 pr-2 font-semibold text-slate-700">Bắt buộc?</th>
                          <th className="py-1.5 font-semibold text-slate-700">Giá trị hợp lệ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Chủ đề</td>
                          <td className="py-1.5 pr-2 text-red-600 font-semibold">Có</td>
                          <td className="py-1.5">Tên chủ đề (tự tạo mới nếu chưa có)</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Nội dung</td>
                          <td className="py-1.5 pr-2 text-red-600 font-semibold">Có</td>
                          <td className="py-1.5">Nội dung câu hỏi</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Phạm vi</td>
                          <td className="py-1.5 pr-2 text-slate-400">Không</td>
                          <td className="py-1.5">chung — hoặc — riêng (mặc định: chung)</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Bộ phận</td>
                          <td className="py-1.5 pr-2 text-amber-600 font-semibold">Nếu Phạm vi = riêng</td>
                          <td className="py-1.5">Tên bộ phận — nếu chưa có, bạn sẽ được tạo ngay ở bước xem trước</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Loại</td>
                          <td className="py-1.5 pr-2 text-slate-400">Không</td>
                          <td className="py-1.5">lý thuyết — hoặc — bài tập (mặc định: lý thuyết)</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Đáp án</td>
                          <td className="py-1.5 pr-2 text-slate-400">Không</td>
                          <td className="py-1.5">chọn 1 — hoặc — chọn nhiều (mặc định: chọn 1)</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Độ khó</td>
                          <td className="py-1.5 pr-2 text-slate-400">Không</td>
                          <td className="py-1.5">dễ, trung bình, khó (mặc định: trung bình)</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Lựa chọn 1…8</td>
                          <td className="py-1.5 pr-2 text-red-600 font-semibold">Ít nhất 2</td>
                          <td className="py-1.5">Nội dung từng phương án trả lời</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 font-semibold">Đáp án đúng</td>
                          <td className="py-1.5 pr-2 text-red-600 font-semibold">Có</td>
                          <td className="py-1.5">Số thứ tự đáp án đúng, vd: 1 hoặc 1,3</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="text-slate-400 italic">
                      Điền tên cột đúng như trên (có dấu). Tải file mẫu ở trên để xem đầy đủ giải thích (sheet "HuongDan") kèm 2 dòng ví dụ thật.
                    </p>
                  </div>
                )}
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-50 cursor-pointer relative">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleImportFile}
                  disabled={importLoading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-wait"
                />
                {importLoading ? (
                  <Loader2 className="w-10 h-10 text-[#008BC5] mx-auto mb-2 animate-spin" />
                ) : (
                  <Upload className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                )}
                <p className="text-sm font-semibold text-slate-700">
                  {importLoading ? 'Đang phân tích file...' : 'Tải file Excel câu hỏi lên đây'}
                </p>
                <p className="text-xs text-slate-400 mt-1">Định dạng hỗ trợ: .xlsx, .xls (Tối đa 5MB) — chọn file sẽ tự xem trước, chưa ghi vào hệ thống</p>
              </div>

              <p className="text-xs text-slate-500">
                Xem sheet "HuongDan" trong file mẫu để biết chi tiết từng cột: Chủ đề, Nội dung, Phạm vi, Bộ phận, Loại, Đáp án, Độ khó, Lựa chọn 1–8, Đáp án đúng.
              </p>

              <div className="pt-2 flex gap-3 pb-1">
                <button
                  type="button"
                  onClick={() => setIsImportOpen(false)}
                  disabled={importLoading}
                  className="flex-1 py-3 min-h-[46px] border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT EXCEL — XEM TRƯỚC & XÁC NHẬN (bước 2/2) */}
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-lg text-[#0F172A] flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#008BC5]" /> Xem trước import — chưa ghi vào hệ thống
              </h3>
              <button
                onClick={closeImportPreview}
                disabled={importConfirming}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto" data-lenis-prevent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xl font-bold text-[#0F172A]">{importPreview.totalRows}</div>
                  <div className="text-sm text-slate-500">Tổng số dòng</div>
                </div>
                <div className="bg-[#F0FDF4] rounded-lg p-3">
                  <div className="text-xl font-bold text-[#22C55E]">{importPreview.readyCount}</div>
                  <div className="text-sm text-slate-500">Sẵn sàng thêm</div>
                </div>
                <div className="bg-[#FFF7ED] rounded-lg p-3">
                  <div className="text-xl font-bold text-[#F6AD37]">{importPreview.duplicateCount}</div>
                  <div className="text-sm text-slate-500">Trùng câu cũ</div>
                </div>
                <div className="bg-[#FEECEC] rounded-lg p-3">
                  <div className="text-xl font-bold text-[#E53E3E]">{importPreview.errorCount}</div>
                  <div className="text-sm text-slate-500">Lỗi dữ liệu</div>
                </div>
              </div>

              {/* PHÒNG BAN CÒN THIẾU — tạo ngay tại đây (mã + mô tả), không
                  cần thoát ra ngoài tạo tay rồi import lại như trước. */}
              {deptDrafts.length > 0 && (
                <div className="border border-amber-300 bg-[#FFF7ED] rounded-lg p-3 space-y-3">
                  <div className="flex items-start gap-2 text-xs text-[#92400E]">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      File có câu hỏi riêng cho các bộ phận sau nhưng hệ thống <b>chưa có</b>. Nhập đủ mã + mô tả rồi bấm "Xác nhận nhập" để tạo bộ phận và import luôn các câu riêng. Bỏ tick "Tạo bộ phận này" nếu bạn KHÔNG muốn tạo (các câu hỏi riêng của bộ phận đó sẽ bị bỏ qua, chỉ import câu chung).
                    </span>
                  </div>
                  <div className="space-y-2">
                    {deptDrafts.map((d) => (
                      <div key={d.name} className="bg-white border border-amber-200 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={d.include}
                              onChange={() => toggleDeptInclude(d.name)}
                              disabled={importConfirming}
                              className="w-4 h-4"
                            />
                            Tạo bộ phận này
                            <span className="font-semibold text-[#0F172A]">{d.name}</span>
                          </label>
                          <span className="text-xs text-slate-500 shrink-0">{d.rowCount} câu riêng</span>
                        </div>

                        {d.include ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Mã phòng ban</label>
                              <input
                                type="text"
                                value={d.code}
                                onChange={(e) => updateDeptField(d.name, 'code', e.target.value)}
                                disabled={importConfirming || d.codeLocked}
                                placeholder="vd. CNTT"
                                className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Tên phòng ban</label>
                              <input
                                type="text"
                                value={d.name}
                                disabled
                                className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg bg-slate-100 text-slate-500"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs text-slate-500 mb-1">Mô tả ngắn gọn</label>
                              <input
                                type="text"
                                value={d.description}
                                onChange={(e) => updateDeptField(d.name, 'description', e.target.value)}
                                disabled={importConfirming || d.descriptionLocked}
                                placeholder="Mô tả chức năng bộ phận"
                                className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500"
                              />
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 pl-6">
                            Sẽ bỏ qua {d.rowCount} câu riêng của bộ phận này, chỉ import câu chung.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CÂU TRÙNG — mặc định bỏ qua (giữ câu cũ), tick để vẫn thêm
                  câu mới dù nội dung trùng (vd cố ý tạo 2 câu giống nhau). */}
              {importPreview.duplicates?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">
                    Các câu hỏi dưới đây <b>trùng nội dung</b> với câu đã có trong ngân hàng (cùng chủ đề/phạm vi/bộ phận). Mặc định sẽ <b>bỏ qua, giữ câu cũ</b> — tick vào dòng nào bạn muốn vẫn thêm câu mới song song.
                  </p>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto" data-lenis-prevent>
                    {importPreview.duplicates.map((d) => (
                      <label key={d.row} className="p-2.5 text-sm flex items-start gap-2 cursor-pointer hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={keepDupRows.includes(d.row)}
                          onChange={() => toggleKeepDupRow(d.row)}
                          disabled={importConfirming}
                          className="w-4 h-4 mt-0.5 shrink-0"
                        />
                        <span className="text-slate-400 w-14 shrink-0">Dòng {d.row}</span>
                        <span className="flex-1 min-w-0 text-slate-700">{d.content}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* LỖI KHÁC — luôn bị bỏ qua, chỉ hiển thị để người dùng biết
                  sửa lại file cho lần import sau. */}
              {importPreview.errors?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">Các dòng dưới đây có lỗi khác, sẽ <b>luôn bị bỏ qua</b>:</p>
                  <div className="border border-red-200 rounded-lg divide-y divide-red-100 max-h-40 overflow-y-auto" data-lenis-prevent>
                    {importPreview.errors.map((e) => (
                      <div key={e.row} className="p-2.5 text-sm flex items-start gap-2">
                        <span className="text-slate-400 w-14 shrink-0">Dòng {e.row}</span>
                        <span className="flex-1 min-w-0 text-[#E53E3E]">{e.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeImportPreview}
                  disabled={importConfirming}
                  className="flex-1 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={
                    importConfirming ||
                    hasIncompleteIncludedDept ||
                    importPreview.readyCount + keepDupRows.length + includedDeptRowCount === 0
                  }
                  className="flex-1 py-2.5 bg-[#008BC5] text-white rounded-lg font-semibold hover:bg-[#007ba1] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {importConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Xác nhận nhập ({importPreview.readyCount + keepDupRows.length + includedDeptRowCount} câu)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  ShieldCheck,
  RefreshCw,
  Loader2,
  Circle,
  CheckSquare,
  Square,
  List,
  ChevronLeft,
  ShieldAlert,
} from 'lucide-react';
import { Z176_COMPANY_INFO } from '../data';
import { fetchMyResults } from '../services/report.service';
import {
  fetchMyExam,
  startExamAttempt,
  submitExamAttempt,
  answerExamQuestion,
  sendExamHeartbeat,
} from '../services/exam-attempt.service';
import { useScrollLock } from '../hooks/useScrollLock';

// ── Lưu tạm tiến trình đang làm dở vào localStorage ─────────────────────────
// Chỉ để tránh mất lựa chọn khi reload trang giữa chừng TRÊN CÙNG THIẾT BỊ.
// Điểm số/chấm điểm thật vẫn luôn do backend quyết định lúc nộp bài
// (submitExamAttempt), dữ liệu này KHÔNG được tin tưởng để tính điểm.
//
// Nguồn sự thật để KHÔI PHỤC lựa chọn khi mở lại (kể cả từ thiết bị khác) là
// `savedAnswers` server trả về trong fetchMyExam() — localStorage chỉ là lớp
// dự phòng cho trường hợp offline tạm thời trước khi autosave kịp gửi lên.
const draftKey = (attemptId) => `z176_exam_draft_${attemptId}`;

function loadDraftAnswers(attemptId) {
  if (!attemptId) return {};
  try {
    const raw = localStorage.getItem(draftKey(attemptId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDraftAnswers(attemptId, answers) {
  if (!attemptId) return;
  try {
    localStorage.setItem(draftKey(attemptId), JSON.stringify(answers));
  } catch {
    /* localStorage đầy/bị chặn — bỏ qua, không chặn luồng làm bài */
  }
}

function clearDraftAnswers(attemptId) {
  if (!attemptId) return;
  try {
    localStorage.removeItem(draftKey(attemptId));
  } catch {
    /* ignore */
  }
}

/** Chuyển savedAnswers dạng mảng [{questionId, selectedAnswerIds}] từ server
 * thành object { [questionId]: string[] } để khớp với state selectedAnswers. */
function savedAnswersToMap(savedAnswers) {
  const map = {};
  for (const item of savedAnswers ?? []) {
    if (!item?.questionId) continue;
    map[item.questionId] = Array.isArray(item.selectedAnswerIds) ? item.selectedAnswerIds : [];
  }
  return map;
}

// Client heartbeat mỗi 15s trong khi tab đang hiển thị — backend tính timeout
// dựa trên lastActiveAt (mốc server nhận request gần nhất), không phải đồng hồ
// client, nên khoảng heartbeat này chỉ cần đủ dày để phát hiện sớm, không cần
// chính xác tuyệt đối.
const HEARTBEAT_INTERVAL_MS = 15_000;

// Số giây đếm ngược cảnh báo "rời màn hình thi" trước khi tự nộp bài với đáp
// án hiện tại. Đây là lớp cảnh báo SỚM, RÕ RÀNG cho thí sinh thấy ngay — khác
// với cơ chế heartbeat/auto-submit sau 1 phút "im lặng" đã có sẵn ở backend
// (vẫn giữ nguyên, không đụng vào, đây chỉ là lớp UI cảnh báo thuần client).
const LEAVE_WARNING_SECONDS = 10;

export const ExamModal = ({ isOpen, onClose, currentUser, onOpenLogin }) => {
  useScrollLock(isOpen);

  // step: 'loading' | 'confirm' | 'testing' | 'submitting' | 'result' | 'auto-submitted' | 'error'
  const [step, setStep] = useState('loading');
  const [loadError, setLoadError] = useState(null);

  // Thông tin nhân viên thật (currentUser chỉ có id/username/roleCode, không có
  // họ tên/mã NV/phòng ban — phải lấy riêng, giống CandidateDashboard).
  const [employee, setEmployee] = useState(null);

  // Dữ liệu đề thi + trạng thái lượt thi lấy từ GET /exam-attempts/my-exam
  const [examData, setExamData] = useState(null);

  // Lượt thi đang làm (sau khi bấm bắt đầu / resume)
  const [attemptId, setAttemptId] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({}); // { [questionId]: string[] }
  const [examSecondsLeft, setExamSecondsLeft] = useState(0);
  const [submitError, setSubmitError] = useState(null);

  // Ảnh minh hoạ đề bài (currentQ.imageUrl) bị lỗi tải (link hỏng, mất mạng...)
  // — reset về false mỗi khi chuyển câu, KHÔNG chặn thí sinh làm bài, chỉ ẩn
  // ảnh và hiện chú thích thay thế.
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  // Chế độ xem: khi bật, thay TOÀN BỘ vùng nội dung câu hỏi bằng màn hình danh
  // sách câu hỏi full-height (thay vì chèn 1 khung nhỏ phía trên như trước) —
  // để thoải mái cuộn/chọn khi đề có 30-50 câu, đặc biệt trên điện thoại.
  // Thuần UI, không ảnh hưởng dữ liệu.
  const [showQuestionGrid, setShowQuestionGrid] = useState(false);

  // Hiện cảnh báo xác nhận trước khi nộp bài nếu còn câu chưa trả lời — tránh
  // thí sinh bấm nhầm "NỘP BÀI THI" khi đề dài (30-50 câu) mà chưa làm hết.
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  // ── Cảnh báo "rời màn hình thi" (chuyển tab/app, alt-tab, khoá máy...) ────
  // Hiện overlay ngay lập tức + đếm ngược LEAVE_WARNING_SECONDS giây. Quay lại
  // trước khi hết giờ thì huỷ, không ảnh hưởng gì. Hết giờ thì tự nộp bài với
  // đáp án hiện có (giống hệt luồng auto-submit đã có, chỉ rút ngắn thời gian
  // và có cảnh báo rõ ràng thay vì âm thầm).
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [leaveSecondsLeft, setLeaveSecondsLeft] = useState(LEAVE_WARNING_SECONDS);
  const leaveDeadlineRef = useRef(null);
  const leaveIntervalRef = useRef(null);
  const leaveActiveRef = useRef(false);

  const [resultData, setResultData] = useState(null);

  const finishingRef = useRef(false);
  // Giữ attemptId mới nhất trong ref để heartbeat/interval luôn đọc đúng giá
  // trị hiện tại mà không phải dựng lại interval mỗi lần state đổi.
  const attemptIdRef = useRef(null);
  // Giữ step mới nhất trong ref — cần cho listener rời-màn-hình vì listener
  // được đăng ký ở cấp document/window, phải luôn biết step "testing" có còn
  // đúng không tại thời điểm sự kiện xảy ra, không phải lúc effect chạy.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // ── Tải dữ liệu khi mở modal ─────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    if (!currentUser) {
      setStep('confirm');
      return;
    }

    let cancelled = false;
    setStep('loading');
    setLoadError(null);
    setResultData(null);
    setAttemptId(null);
    setExpiresAt(null);
    setSelectedAnswers({});
    setCurrentQuestionIndex(0);
    finishingRef.current = false;

    Promise.all([fetchMyResults(), fetchMyExam()])
      .then(([resultsData, exam]) => {
        if (cancelled) return;
        setEmployee(resultsData?.employee ?? null);
        setExamData(exam);

        // Nếu đang có lượt thi dở (resume, kể cả từ thiết bị/trình duyệt khác),
        // khôi phục ngay đáp án đã autosave trên server — đây là nguồn sự thật,
        // không phải localStorage (localStorage chỉ đúng trên đúng thiết bị đó).
        if (exam?.attempt) {
          setAttemptId(exam.attempt.id);
          setExpiresAt(exam.attempt.expiresAt ? new Date(exam.attempt.expiresAt) : null);
          setSelectedAnswers(savedAnswersToMap(exam.savedAnswers));
        }

        setStep('confirm');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.message || 'Không thể tải dữ liệu bài thi.');
        setStep('error');
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, currentUser]);

  // ── Bắt đầu / tiếp tục lượt thi ────────────────────────────
  const handleStartExam = async () => {
    if (!currentUser) {
      onOpenLogin();
      return;
    }
    try {
      setSubmitError(null);
      const data = await startExamAttempt();
      setAttemptId(data.attemptId);
      setExpiresAt(new Date(data.expiresAt));

      // Lấy lại đề thi ngay sau khi bắt đầu/tiếp tục lượt thi — lúc này backend
      // đã có attempt "in_progress" nên trả về đúng bộ câu/đáp án đã xáo riêng
      // cho lượt thi này, thay vì bản preview mặc định (chưa xáo) lúc xác nhận.
      // Đồng thời trả kèm savedAnswers — nếu là resume (kể cả từ thiết bị
      // khác) thì đây chính là chỗ khôi phục đúng các lựa chọn đã chọn trước đó.
      const freshExamData = await fetchMyExam();
      setExamData(freshExamData);
      setSelectedAnswers(savedAnswersToMap(freshExamData?.savedAnswers));

      setStep('testing');
    } catch (err) {
      setSubmitError(err?.message || 'Không thể bắt đầu lượt thi.');
    }
  };

  // ── Nộp bài (thí sinh tự bấm) ─────────────────────────────
  const handleFinishExam = useCallback(async () => {
    if (!attemptId || finishingRef.current) return;
    finishingRef.current = true;
    setStep('submitting');

    const answers = (examData?.questions ?? []).map((q) => ({
      questionId: q.id,
      selectedAnswerIds: selectedAnswers[q.id] || [],
    }));

    try {
      const data = await submitExamAttempt(attemptId, answers);
      clearDraftAnswers(attemptId);
      setResultData(data);
      setStep('result');
    } catch (err) {
      setSubmitError(err?.message || 'Nộp bài thất bại, vui lòng thử lại.');
      setStep('testing');
    } finally {
      finishingRef.current = false;
    }
  }, [attemptId, examData, selectedAnswers]);

  // ── Đồng hồ đếm ngược — tính theo expiresAt thật của server ─
  useEffect(() => {
    if (step !== 'testing' || !expiresAt) return;

    const tick = () => {
      const secondsLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setExamSecondsLeft(secondsLeft);
      if (secondsLeft <= 0) {
        handleFinishExam();
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [step, expiresAt, handleFinishExam]);

  // Khôi phục lựa chọn đã lưu tạm trong localStorage (nếu có) ngay khi biết
  // attemptId — chỉ dùng làm lớp dự phòng bổ sung cho những câu CHƯA có trong
  // savedAnswers từ server (vd vừa chọn xong nhưng autosave chưa kịp gửi lên
  // trước khi F5). Không ghi đè lên đáp án đã có từ server.
  useEffect(() => {
    if (!attemptId) return;
    const draft = loadDraftAnswers(attemptId);
    if (Object.keys(draft).length > 0) {
      setSelectedAnswers((prev) => ({ ...draft, ...prev }));
    }
  }, [attemptId]);

  // ── Giữ attemptIdRef đồng bộ với state để interval bên dưới luôn đọc đúng ──
  useEffect(() => {
    attemptIdRef.current = attemptId;
  }, [attemptId]);

  // Reset trạng thái "ảnh lỗi tải" mỗi khi chuyển sang câu khác — tránh 1 ảnh
  // lỗi ở câu trước làm ẩn nhầm ảnh hợp lệ của câu sau.
  useEffect(() => {
    setImageLoadFailed(false);
  }, [currentQuestionIndex]);

  // ── Heartbeat định kỳ trong lúc đang làm bài ─────────────────────────────
  // Chỉ gửi khi tab đang thực sự hiển thị (document.visibilityState==='visible')
  // — đúng yêu cầu ban đầu, tránh heartbeat "ma" khi thí sinh đang ở tab khác.
  // Nếu backend phát hiện đã rời quá 1 phút (autoSubmitReason khác null), coi
  // như bài đã bị hệ thống tự nộp — dừng làm bài ngay và hiện đúng thông báo.
  // Lớp này KHÔNG đổi — cảnh báo 10s bên dưới là lớp UI bổ sung, không thay
  // thế cơ chế 1-phút-im-lặng này (phòng trường hợp thí sinh rời tab nhưng
  // JS bị treo/throttle nặng và overlay không kịp bắn).
  useEffect(() => {
    if (step !== 'testing' || !attemptId) return;

    let cancelled = false;

    const beat = async () => {
      if (document.visibilityState !== 'visible') return;
      const currentAttemptId = attemptIdRef.current;
      if (!currentAttemptId) return;
      try {
        const data = await sendExamHeartbeat(currentAttemptId);
        if (cancelled) return;
        if (data?.autoSubmitReason) {
          clearDraftAnswers(currentAttemptId);
          setStep('auto-submitted');
        }
      } catch {
        // Lỗi mạng tạm thời khi heartbeat — bỏ qua, thử lại ở lần kế tiếp,
        // không làm gián đoạn bài thi vì 1 lần heartbeat lỡ nhịp.
      }
    };

    // Gửi ngay 1 lần khi vào testing (không đợi đủ 15s đầu tiên), và mỗi khi
    // tab quay lại hiển thị — để bắt kịp trường hợp thí sinh rời tab >1 phút
    // rồi quay lại ngay, thay vì phải đợi tới chu kỳ interval kế tiếp.
    beat();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') beat();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [step, attemptId]);

  // ── Cảnh báo rời màn hình thi + đếm ngược 10s ────────────────────────────
  // Bắt CẢ 2 nguồn sự kiện để không lọt trường hợp nào:
  // - visibilitychange -> 'hidden': đổi tab, đóng/mở app khác trên mobile,
  //   khoá màn hình, tắt màn hình.
  // - window 'blur': bắt cả trường hợp alt-tab sang cửa sổ khác nhưng tab
  //   trình duyệt vẫn kỹ thuật "visible" (visibilitychange không bắn).
  // Dùng chung 1 hàm start/cancel, có cờ leaveActiveRef để tránh 2 sự kiện
  // cùng lúc dựng 2 interval chồng nhau.
  const clearLeaveTimer = useCallback(() => {
    if (leaveIntervalRef.current) {
      clearInterval(leaveIntervalRef.current);
      leaveIntervalRef.current = null;
    }
  }, []);

  const cancelLeaveWarning = useCallback(() => {
    leaveActiveRef.current = false;
    leaveDeadlineRef.current = null;
    clearLeaveTimer();
    setShowLeaveWarning(false);
    setLeaveSecondsLeft(LEAVE_WARNING_SECONDS);
  }, [clearLeaveTimer]);

  const startLeaveWarning = useCallback(() => {
    if (stepRef.current !== 'testing') return;
    if (leaveActiveRef.current) return; // đã đang đếm rồi, không dựng lại
    leaveActiveRef.current = true;

    const deadline = Date.now() + LEAVE_WARNING_SECONDS * 1000;
    leaveDeadlineRef.current = deadline;
    setLeaveSecondsLeft(LEAVE_WARNING_SECONDS);
    setShowLeaveWarning(true);

    // Tính theo deadline thời gian thực (Date.now()) chứ không đếm theo số
    // lần tick — nên vẫn ra đúng kết quả ngay cả khi trình duyệt throttle
    // setInterval lúc tab ẩn (delay tick không làm sai tổng thời gian).
    clearLeaveTimer();
    leaveIntervalRef.current = setInterval(() => {
      const remainingMs = leaveDeadlineRef.current - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setLeaveSecondsLeft(remainingSec);
      if (remainingMs <= 0) {
        clearLeaveTimer();
        leaveActiveRef.current = false;
        setShowLeaveWarning(false);
        handleFinishExam();
      }
    }, 500);
  }, [clearLeaveTimer, handleFinishExam]);

  useEffect(() => {
    if (step !== 'testing') {
      // Rời khỏi bước testing (đã nộp bài, đóng modal...) — dọn sạch cảnh báo
      // đang treo nếu có, tránh countdown chạy ngầm vô nghĩa.
      cancelLeaveWarning();
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        startLeaveWarning();
      } else if (document.visibilityState === 'visible') {
        cancelLeaveWarning();
      }
    };
    const handleBlur = () => startLeaveWarning();
    const handleFocus = () => cancelLeaveWarning();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      clearLeaveTimer();
    };
  }, [step, startLeaveWarning, cancelLeaveWarning, clearLeaveTimer]);

  // ── Chặn copy nội dung câu hỏi/đáp án (mức răn đe, không chặn screenshot) ─
  const handleBlockCopy = useCallback((e) => {
    e.preventDefault();
  }, []);

  // ── Autosave 1 câu trả lời lên server, không chặn UI (fire-and-forget) ───
  const answerRequestSeqRef = useRef(0);
  const autosaveAnswer = useCallback(
    async (questionId, selectedAnswerIds) => {
      const currentAttemptId = attemptIdRef.current;
      if (!currentAttemptId) return;
      const seq = ++answerRequestSeqRef.current;
      try {
        const data = await answerExamQuestion(currentAttemptId, questionId, selectedAnswerIds);
        // Nếu có request answer khác đã chạy sau request này, bỏ qua kết quả
        // cũ để tránh xử lý autoSubmit trùng/lệch thứ tự.
        if (seq !== answerRequestSeqRef.current) return;
        if (data?.autoSubmitReason) {
          clearDraftAnswers(currentAttemptId);
          setStep('auto-submitted');
        }
      } catch (err) {
        // Backend trả lỗi ATTEMPT_INVALID_STATUS nếu lượt thi vừa bị tự nộp
        // ngay giữa lúc client đang gửi câu trả lời — coi như đã tự nộp.
        if (err?.code === 'ATTEMPT_INVALID_STATUS') {
          clearDraftAnswers(currentAttemptId);
          setStep('auto-submitted');
        }
        // Các lỗi mạng khác: bỏ qua, đáp án vẫn còn trong localStorage draft
        // và selectedAnswers state, sẽ tự thử gửi lại ở lần chọn tiếp theo.
      }
    },
    [],
  );

  if (!isOpen) return null;

  const formatTimer = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const questions = examData?.questions ?? [];
  const currentQ = questions[currentQuestionIndex];
  const answeredCount = Object.keys(selectedAnswers).filter((qId) => (selectedAnswers[qId] || []).length > 0).length;
  const progressPercent = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  const handleSelectOption = (question, optionId) => {
    setSelectedAnswers((prev) => {
      const prevSelected = prev[question.id] || [];
      const next =
        question.answerType === 'multiple'
          ? prevSelected.includes(optionId)
            ? prevSelected.filter((id) => id !== optionId)
            : [...prevSelected, optionId]
          : [optionId];
      const updated = { ...prev, [question.id]: next };
      saveDraftAnswers(attemptId, updated);
      autosaveAnswer(question.id, next);
      return updated;
    });
  };

  const unansweredIndexes = questions
    .map((q, idx) => ({ idx, answered: (selectedAnswers[q.id] || []).length > 0 }))
    .filter((x) => !x.answered)
    .map((x) => x.idx);

  const handleJumpToQuestion = (index) => {
    setCurrentQuestionIndex(index);
    setShowQuestionGrid(false);
    setConfirmSubmitOpen(false);
  };

  // Bấm nút "NỘP BÀI THI": nếu còn câu chưa trả lời thì chặn lại, hiện xác
  // nhận trước; nộp thật chỉ diễn ra khi thí sinh xác nhận (hoặc đã làm hết).
  const handleRequestFinishExam = () => {
    if (unansweredIndexes.length > 0) {
      setConfirmSubmitOpen(true);
      return;
    }
    handleFinishExam();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
      data-lenis-prevent
    >
      <div className="bg-white w-full max-w-2xl rounded-[10px] shadow-2xl overflow-hidden border border-slate-200 my-auto flex flex-col max-h-[92dvh] relative">
        {/* Overlay cảnh báo rời màn hình thi — chỉ hiện khi đang testing và
            phát hiện tab/app bị chuyển. Che toàn bộ modal, không cho tương
            tác gì khác cho tới khi quay lại hoặc hết giờ. */}
        {showLeaveWarning && step === 'testing' && (
          <div className="absolute inset-0 z-[60] bg-[#0F172A]/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-[#F6AD37] flex items-center justify-center shadow-z176">
              <ShieldAlert className="w-9 h-9 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white">Bạn đã rời khỏi màn hình thi!</h3>
            <p className="text-sm text-slate-200 max-w-sm">
              Vui lòng quay lại ngay. Nếu không, bài thi sẽ tự động được nộp với các đáp án đang chọn.
            </p>
            <div className="w-20 h-20 rounded-full border-4 border-[#F6AD37] flex items-center justify-center">
              <span className="text-3xl font-extrabold text-white font-mono">{leaveSecondsLeft}</span>
            </div>
            <p className="text-xs text-slate-400">giây trước khi tự động nộp bài</p>
          </div>
        )}

        {/* Modal Header */}
        <div className="bg-[#0F172A] text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#008BC5] text-white flex items-center justify-center font-bold shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white leading-tight">HỆ THỐNG THI TRỰC TUYẾN Z176</h3>
              <p className="text-xs text-[#64748B]">An toàn lao động & Quy chế nội bộ</p>
            </div>
          </div>

          {/* Nút đóng: ẩn khi đang làm bài (step === 'testing') để tránh
              thí sinh bấm nhầm thoát ra giữa lúc đang thi và bị tính thời
              gian/mất trạng thái làm bài. Các step khác (confirm, loading,
              error, result...) vẫn cho đóng bình thường. */}
          {step !== 'testing' && (
            <button
              onClick={onClose}
              className="p-2 text-slate-300 hover:text-white rounded-lg min-touch-target flex items-center justify-center"
              aria-label="Đóng giao diện thi"
            >
              <X className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* LOADING */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500 flex-1">
            <Loader2 className="w-8 h-8 animate-spin text-[#008BC5]" />
            <span>Đang tải dữ liệu bài thi...</span>
          </div>
        )}

        {/* ERROR (không lấy được đề, chưa được gán đề, chưa có kỳ thi active...) */}
        {step === 'error' && (
          <div className="p-6 flex flex-col items-center justify-center gap-3 text-center flex-1">
            <AlertCircle className="w-10 h-10 text-red-500" />
            <p className="text-[#0F172A] font-semibold">{loadError}</p>
            <button
              onClick={onClose}
              className="mt-2 px-5 py-2.5 bg-[#334155] text-white font-semibold text-sm rounded-lg hover:bg-[#1e293b] transition-colors"
            >
              Đóng
            </button>
          </div>
        )}

        {/* STEP: CONFIRMATION SCREEN
            Nút hành động chính được đặt ngay sau khối thông tin nhân viên,
            TRƯỚC danh sách nội quy — vì danh sách nội quy có thể dài, đẩy
            nút xuống dưới màn hình trên các máy màn hình thấp (vd iPhone),
            khiến người dùng phải cuộn hết nội quy mới thấy nút để bấm vào
            thi. Đưa nút lên trước giúp thấy và bấm ngay không cần cuộn. */}
        {step === 'confirm' && (
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1" data-lenis-prevent>
            <div className="bg-slate-50 border border-slate-200 rounded-[10px] p-4 space-y-2">
              <h4 className="font-bold text-base text-[#0F172A]">Xác nhận thông tin cán bộ / công nhân thi:</h4>

              {currentUser ? (
                employee ? (
                  <div className="space-y-1.5 text-base text-[#334155] bg-white p-3 rounded-lg border border-slate-200">
                    <div>
                      Họ và tên: <strong className="text-[#0F172A]">{employee.fullname}</strong>
                    </div>
                    <div>
                      Mã nhân viên: <strong className="text-[#008BC5] font-mono">{employee.employeeCode || '—'}</strong>
                    </div>
                    <div>
                      Xưởng / Phòng: <strong className="text-[#0F172A]">{employee.departmentName || '—'}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-[#FFFBEB] border border-[#F6AD37]/40 rounded-lg text-[#0F172A] text-sm">
                    Tài khoản của bạn chưa được liên kết với hồ sơ nhân viên. Vui lòng liên hệ quản trị viên.
                  </div>
                )
              ) : (
                <div className="p-3 bg-[#FFFBEB] border border-[#F6AD37]/40 rounded-lg text-[#0F172A] text-sm font-medium flex items-center justify-between gap-2">
                  <span>Bạn chưa đăng nhập thông tin nhân viên.</span>
                  <button
                    onClick={onOpenLogin}
                    className="px-3 py-1.5 bg-[#008BC5] text-white font-bold text-sm rounded-md hover:bg-[#007ba1]"
                  >
                    Đăng nhập ngay
                  </button>
                </div>
              )}
            </div>

            {submitError && (
              <div className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg text-[#0F172A] text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {!currentUser ? (
              <button
                onClick={onOpenLogin}
                className="w-full min-h-[52px] bg-[#008BC5] text-white font-bold text-lg rounded-full hover:bg-[#007ba1] transition-colors flex items-center justify-center gap-2 shadow-z176 min-touch-target"
              >
                <span>ĐĂNG NHẬP ĐỂ VÀO THI</span>
              </button>
            ) : !examData?.canTake ? (
              <div className="text-center text-sm text-slate-500 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                Bạn đã sử dụng hết lượt thi chính thức. Nếu cần thi lại, vui lòng liên hệ Người duyệt đề.
              </div>
            ) : (
              <button
                onClick={handleStartExam}
                disabled={!employee}
                className="w-full min-h-[52px] bg-[#008BC5] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-lg rounded-full hover:bg-[#007ba1] transition-colors flex items-center justify-center gap-2 shadow-z176 min-touch-target"
              >
                <CheckCircle2 className="w-6 h-6" />
                <span>{examData?.attempt ? 'TIẾP TỤC BÀI THI ĐANG DỞ' : 'XÁC NHẬN & BẮT ĐẦU BÀI THI'}</span>
              </button>
            )}

            {currentUser && examData && (
              <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-[10px] p-4 text-sm text-[#334155]">
                <h5 className="font-bold text-base text-[#0F172A]">{examData.exam.title}</h5>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    Bài thi gồm {examData.exam.totalQuestions} câu hỏi, làm trong tối đa{' '}
                    {examData.exam.durationMinutes} phút.
                  </li>
                  <li>Mỗi câu hỏi chọn 1 hoặc nhiều đáp án đúng tuỳ theo yêu cầu của từng câu.</li>
                  <li>Không thoát trình duyệt, không chuyển sang tab/ứng dụng khác trong khi đang làm bài.</li>
                  <li>
                    Nếu rời khỏi màn hình thi (chuyển tab, mở app khác, alt-tab...), hệ thống sẽ hiện cảnh báo và tự
                    động nộp bài sau {LEAVE_WARNING_SECONDS} giây nếu không quay lại kịp.
                  </li>
                  <li>Mỗi thí sinh có {examData.maxAttempts} lượt thi chính thức. Muốn thi lại cần được Người duyệt đề cấp phép riêng.</li>
                  {examData.attempt && (
                    <li className="text-[#008BC5] font-semibold">
                      Bạn đang có 1 lượt thi dở dang — bấm bên trên để tiếp tục đúng lượt đó (không tính thêm lượt mới,
                      các câu đã chọn trước đó sẽ được khôi phục kể cả khi đổi thiết bị).
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* STEP: TESTING SCREEN */}
        {step === 'testing' && currentQ && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Top Bar with Timer & Progress */}
            <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 shrink-0 space-y-2">
              <div className="flex items-center justify-between text-sm gap-2">
                {showQuestionGrid ? (
                  <button
                    onClick={() => setShowQuestionGrid(false)}
                    className="flex items-center gap-1.5 font-bold text-[#0F172A] px-2 py-1 -mx-2 -my-1 rounded-lg hover:bg-slate-200 transition-colors min-touch-target"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Quay lại câu {currentQuestionIndex + 1}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowQuestionGrid(true)}
                    className="flex items-center gap-2 font-bold text-[#0F172A] px-2 py-1 -mx-2 -my-1 rounded-lg hover:bg-slate-200 transition-colors min-touch-target"
                    aria-label="Mở danh sách câu hỏi"
                  >
                    <List className="w-4 h-4 text-[#008BC5] shrink-0" />
                    <span>
                      Câu {currentQuestionIndex + 1}/{questions.length}
                    </span>
                    <span className="text-slate-400 hidden min-[380px]:inline">•</span>
                    <span className="text-[#008BC5] hidden min-[380px]:inline">
                      Đã chọn: {answeredCount}/{questions.length}
                    </span>
                  </button>
                )}

                <div className="flex items-center gap-1.5 px-3 py-1 bg-[#0F172A] text-white font-bold font-mono text-base rounded-md shrink-0">
                  <Clock className="w-4 h-4 text-[#008BC5]" />
                  <span>{formatTimer(examSecondsLeft)}</span>
                </div>
              </div>

              {examData?.exam?.code && (
                <div className="flex items-center justify-end">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#008BC5]/10 text-[#008BC5] font-bold font-mono text-xs border border-[#008BC5]/30">
                    Mã đề: {examData.exam.code}
                  </span>
                </div>
              )}

              {/* Progress bar - thuần hiển thị, tính từ answeredCount/questions.length đã có sẵn */}
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#008BC5] rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {showQuestionGrid ? (
              /* Màn hình danh sách câu hỏi — chiếm toàn bộ vùng nội dung, thoải mái
                 cuộn/chọn khi đề có 30-50 câu, thay vì khung nhỏ chèn phía trên. */
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4" data-lenis-prevent>
                <div>
                  <h4 className="font-bold text-base text-[#0F172A]">Danh sách câu hỏi</h4>
                  <p className="text-sm text-[#334155] mt-0.5">
                    Đã trả lời <strong className="text-[#008BC5]">{answeredCount}/{questions.length}</strong> câu.
                    {unansweredIndexes.length > 0 && (
                      <> Còn <strong className="text-[#E53E3E]">{unansweredIndexes.length}</strong> câu chưa trả lời.</>
                    )}
                  </p>
                </div>

                {/* Chú thích màu */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[#334155] bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded bg-[#008BC5] shrink-0" /> Đang xem
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded bg-[#22C55E] shrink-0" /> Đã chọn
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded bg-white border border-slate-300 shrink-0" /> Chưa chọn
                  </span>
                </div>

                <div className="grid grid-cols-6 min-[420px]:grid-cols-8 sm:grid-cols-10 gap-2">
                  {questions.map((q, idx) => {
                    const isAnswered = (selectedAnswers[q.id] || []).length > 0;
                    const isCurrent = idx === currentQuestionIndex;
                    return (
                      <button
                        key={q.id}
                        onClick={() => handleJumpToQuestion(idx)}
                        className={`aspect-square min-h-[44px] rounded-lg text-sm font-bold flex items-center justify-center border transition-colors ${
                          isCurrent
                            ? 'bg-[#008BC5] border-[#008BC5] text-white ring-2 ring-[#008BC5]/40'
                            : isAnswered
                            ? 'bg-[#22C55E] border-[#22C55E] text-white'
                            : 'bg-white border-slate-300 text-slate-500 hover:bg-slate-50'
                        }`}
                        aria-label={`Đi tới câu ${idx + 1}${isAnswered ? ', đã trả lời' : ', chưa trả lời'}`}
                        aria-current={isCurrent}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                {/* Question Content — chặn copy + không cho bôi đen chọn văn
                    bản (mức răn đe, không chặn được screenshot/chụp lại). */}
                <div
                  className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 select-none"
                  data-lenis-prevent
                  onCopy={handleBlockCopy}
                  style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
                >
                  {submitError && (
                    <div className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-lg text-[#0F172A] text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <div className="text-base sm:text-lg font-bold text-[#0F172A] leading-snug">
                    {currentQuestionIndex + 1}. {currentQ.content}
                    {currentQ.answerType === 'multiple' && (
                      <span className="block text-xs font-semibold text-[#008BC5] mt-1">(Chọn nhiều đáp án đúng)</span>
                    )}
                  </div>

                  {/* Ảnh minh hoạ đề bài (nếu câu hỏi có gắn ảnh) — key theo
                      currentQ.id để reset trạng thái lỗi tải mỗi khi chuyển câu. */}
                  {currentQ.imageUrl && !imageLoadFailed && (
                    <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex justify-center">
                      <img
                        key={currentQ.id}
                        src={currentQ.imageUrl}
                        alt={`Hình minh hoạ câu ${currentQuestionIndex + 1}`}
                        loading="lazy"
                        onError={() => setImageLoadFailed(true)}
                        onDragStart={(e) => e.preventDefault()}
                        className="max-h-72 w-auto object-contain"
                      />
                    </div>
                  )}
                  {currentQ.imageUrl && imageLoadFailed && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Không tải được hình minh hoạ cho câu này — vẫn có thể tiếp tục làm bài bình thường.</span>
                    </div>
                  )}

                  {/* Options list */}
                  <div className="space-y-2.5">
                    {currentQ.options.map((opt) => {
                      const isSelected = (selectedAnswers[currentQ.id] || []).includes(opt.id);
                      const Icon =
                        currentQ.answerType === 'multiple'
                          ? isSelected
                            ? CheckSquare
                            : Square
                          : isSelected
                          ? CheckCircle2
                          : Circle;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => handleSelectOption(currentQ, opt.id)}
                          className={`w-full min-h-[52px] p-3 rounded-lg text-left text-base font-medium transition-all flex items-start gap-3 border min-touch-target ${
                            isSelected
                              ? 'bg-[#EAF6FF] border-[#008BC5] text-[#0F172A] font-semibold ring-2 ring-[#008BC5]/30'
                              : 'bg-slate-50 border-slate-200 text-[#334155] hover:bg-slate-100'
                          }`}
                        >
                          <Icon
                            className={`w-5 h-5 shrink-0 mt-0.5 ${isSelected ? 'text-[#008BC5]' : 'text-slate-400'}`}
                          />
                          <span className="leading-snug">{opt.content}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Xác nhận trước khi nộp nếu còn câu chưa trả lời */}
                  {confirmSubmitOpen && (
                    <div className="p-3 bg-[#FFFBEB] border border-[#F6AD37]/50 rounded-lg space-y-2.5">
                      <div className="flex items-start gap-2 text-[#0F172A] text-sm font-medium">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#F6AD37]" />
                        <span>
                          Bạn còn <strong>{unansweredIndexes.length}</strong> câu chưa trả lời. Bạn vẫn muốn nộp bài?
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => setConfirmSubmitOpen(false)}
                          className="flex-1 px-4 py-2.5 bg-white border border-slate-300 text-[#0F172A] font-bold text-sm rounded-lg hover:bg-slate-50 transition-colors min-touch-target"
                        >
                          Tiếp tục làm bài
                        </button>
                        <button
                          onClick={handleFinishExam}
                          className="flex-1 px-4 py-2.5 bg-[#22C55E] text-white font-bold text-sm rounded-lg hover:bg-green-600 transition-colors min-touch-target"
                        >
                          Nộp bài luôn
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Question Navigation Bar */}
                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                      disabled={currentQuestionIndex === 0}
                      className="px-4 py-2.5 bg-slate-200 disabled:opacity-40 text-[#0F172A] font-bold text-sm rounded-lg hover:bg-slate-300 transition-colors flex items-center gap-1 min-touch-target"
                    >
                      <ArrowLeft className="w-4 h-4" /> Câu trước
                    </button>

                    {currentQuestionIndex < questions.length - 1 ? (
                      <button
                        onClick={() => setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                        className="px-4 py-2.5 bg-[#008BC5] text-white font-bold text-sm rounded-lg hover:bg-[#007ba1] transition-colors flex items-center gap-1 min-touch-target"
                      >
                        Câu sau <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={handleRequestFinishExam}
                        className="px-5 py-2.5 bg-[#22C55E] text-white font-bold text-base rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2 min-touch-target"
                      >
                        <CheckCircle2 className="w-5 h-5" /> NỘP BÀI THI
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP: SUBMITTING */}
        {step === 'submitting' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500 flex-1">
            <Loader2 className="w-8 h-8 animate-spin text-[#008BC5]" />
            <span>Đang nộp bài và chấm điểm...</span>
          </div>
        )}

        {/* STEP: AUTO-SUBMITTED (hệ thống tự nộp do rời khỏi ca thi quá 1 phút) */}
        {step === 'auto-submitted' && (
          <div className="p-6 flex flex-col items-center justify-center gap-3 text-center flex-1">
            <div className="w-16 h-16 rounded-full bg-[#F6AD37] flex items-center justify-center shadow-z176">
              <AlertCircle className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-xl font-bold text-[#0F172A]">Bài thi đã bị tự động nộp</h3>
            <p className="text-sm text-[#334155] max-w-sm">
              Hệ thống ghi nhận bạn <strong>không có thao tác nào trên trang thi trong hơn 1 phút</strong> — có thể do
              chuyển sang tab/ứng dụng khác, khoá màn hình, đóng trình duyệt, hoặc mất kết nối mạng. Để đảm bảo tính
              nghiêm túc của kỳ thi, hệ thống đã tự động nộp bài với các đáp án bạn đã chọn gần nhất trước khi rời đi.
            </p>
            <p className="text-sm text-[#334155] max-w-sm">
              Nếu đây là sự cố ngoài ý muốn (mất mạng, rớt nguồn...) và cần thi lại, vui lòng liên hệ Người duyệt đề
              để được xem xét cấp phép cho lượt thi mới.
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-6 py-3 bg-[#334155] text-white font-bold text-base rounded-lg hover:bg-[#1e293b] transition-colors min-touch-target"
            >
              Đóng
            </button>
          </div>
        )}

        {/* STEP: RESULT SCREEN */}
        {step === 'result' && resultData && (
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 text-center" data-lenis-prevent>
            <div
              className="w-16 h-16 rounded-full mx-auto flex items-center justify-center shadow-z176"
              style={{ backgroundColor: resultData.passed ? '#22C55E' : '#E53E3E' }}
            >
              {resultData.passed ? (
                <Award className="w-10 h-10 text-white" />
              ) : (
                <AlertCircle className="w-10 h-10 text-white" />
              )}
            </div>

            <div>
              <h3 className="text-2xl font-bold text-[#0F172A]">
                {resultData.passed ? 'XIN CHÚC MỪNG — BẠN ĐÃ ĐẠT!' : 'KẾT QUẢ: CHƯA ĐẠT YÊU CẦU'}
              </h3>
              <p className="text-sm text-[#334155] mt-1">{Z176_COMPANY_INFO.contestTitle}</p>
            </div>

            {/* Score Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-[10px] p-4 max-w-sm mx-auto space-y-1">
              <span className="text-sm text-slate-500 font-medium block">Số câu trả lời đúng</span>
              <div className="text-3xl font-extrabold text-[#0F172A]">
                {resultData.correctCount} / {resultData.totalQuestions} câu
              </div>
              <div className="text-xs font-semibold mt-1">
                {resultData.passed ? (
                  <span className="text-[#22C55E]">Đã đáp ứng quy định thi an toàn lao động Z176 ({resultData.score} điểm)</span>
                ) : (
                  <span className="text-[#E53E3E]">Điểm của bạn: {resultData.score}</span>
                )}
              </div>
            </div>

            {!resultData.passed && (
              <div className="max-w-sm mx-auto p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 flex items-start gap-2.5 text-left">
                <RefreshCw className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                <span>
                  Kết quả đã được ghi nhận. Nếu cần thi lại, vui lòng liên hệ Người duyệt đề để được xem xét cấp phép
                  cho lượt thi mới.
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-3 bg-[#334155] text-white font-bold text-base rounded-lg hover:bg-[#1e293b] transition-colors min-touch-target"
              >
                Trở về trang chủ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
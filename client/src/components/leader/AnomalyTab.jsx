import { useState, useEffect } from 'react';
import { ShieldAlert, Users, Timer, Info, CheckCircle2, CircleSlash, Check } from 'lucide-react';
import { fetchAnomalies } from '../../services/analytics.service';
import { Pagination } from '../Pagination';

const PAGE_SIZE = 5;
const EXAM_PAGE_SIZE = 5;
const label = (p) => p.name || p.code || 'Không rõ';
const dur = (s) => (s < 60 ? `${s} giây` : `${Math.floor(s / 60)} phút ${s % 60} giây`);
const dec = (n) => String(n).replace('.', ',');

const Section = ({ icon, title, hint, count, children }) => (
  <section className="space-y-2.5">
    <div>
      <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
        {icon}
        {title} <span className="text-[#64748B] font-medium">({count})</span>
      </h3>
      <p className="text-sm text-[#64748B] mt-0.5">{hint}</p>
    </div>
    {children}
  </section>
);

// ok = đã xét và không thấy gì (xanh); skip = chưa đủ điều kiện để xét (xám, tránh tưởng đã kiểm tra xong)
const Empty = ({ text, skip }) => (
  <p className="flex items-center gap-2 bg-white rounded-xl border border-[#E2E8F0] px-4 py-3 text-base text-[#334155]">
    {skip ? <CircleSlash className="w-5 h-5 text-[#64748B] shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-[#22C55E] shrink-0" />}
    {text}
  </p>
);

const Rows = ({ children }) => <div className="bg-white rounded-xl border border-[#E2E8F0] divide-y divide-[#E2E8F0]">{children}</div>;

const Row = ({ title, sub, badge }) => (
  <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4">
    <div className="min-w-0">
      <p className="text-base font-semibold text-[#0F172A] break-words">{title}</p>
      {sub && <p className="text-sm text-[#64748B] break-words">{sub}</p>}
    </div>
    <span className="self-start sm:self-auto shrink-0 px-2.5 py-1 rounded-full text-sm font-semibold bg-[#FFF7E6] text-[#B7791F]">{badge}</span>
  </div>
);

/** Dấu hiệu bất thường theo kỳ thi. Chỉ là gợi ý để xem xét, KHÔNG kết luận gian lận. */
export const AnomalyTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [examId, setExamId] = useState(null);
  const [examPage, setExamPage] = useState(1);
  const [pairPage, setPairPage] = useState(1);
  const [fastPage, setFastPage] = useState(1);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAnomalies();
      if (res.success) setData(res.data);
      else setError(res.message);
    } catch (err) {
      setError(err.message || 'Lỗi tải dấu hiệu bất thường');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#008BC5] rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-xl text-[#C53030]">
        <p className="text-base">Lỗi: {error}</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2.5 bg-[#334155] hover:bg-[#1e293b] text-white rounded-lg text-base font-semibold min-touch-target"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const { thresholds: t } = data;
  // Chỉ liệt kê kỳ thi có dấu hiệu (server đã xếp nhiều nhất lên đầu); kỳ thi 0 dấu hiệu làm danh sách dài vô ích.
  const exams = data.exams.filter((e) => e.sharedWrong.length + e.fast.length > 0);
  const exam = exams.find((e) => e.examId === examId) ?? exams[0];
  const pairs = exam?.sharedWrong ?? [];
  const fast = exam?.fast ?? [];
  const pairPages = Math.max(1, Math.ceil(pairs.length / PAGE_SIZE));
  const fastPages = Math.max(1, Math.ceil(fast.length / PAGE_SIZE));
  const pCur = Math.min(pairPage, pairPages);
  const fCur = Math.min(fastPage, fastPages);
  const examPages = Math.max(1, Math.ceil(exams.length / EXAM_PAGE_SIZE));
  const eCur = Math.min(examPage, examPages);
  const pick = (id) => {
    setExamId(id);
    setPairPage(1);
    setFastPage(1);
  };

  return (
    <div className="space-y-5">
      <div className="animate-fade-in-up space-y-3" style={{ '--stagger-delay': '0ms' }}>
        <h2 className="text-lg font-bold text-[#0F172A]">Dấu hiệu bất thường</h2>
        <p className="flex items-start gap-2 rounded-xl border border-[#F6AD37]/40 bg-[#FFF7E6] px-4 py-3 text-base text-[#334155]">
          <ShieldAlert className="w-5 h-5 text-[#B7791F] shrink-0 mt-0.5" />
          Đây chỉ là gợi ý để xem xét, không kết luận gian lận. Nên đối chiếu thêm bối cảnh trước khi trao đổi với thí sinh.
        </p>

        <details className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-[#334155]">
          <summary className="flex items-center gap-2 cursor-pointer text-base font-semibold min-touch-target select-none">
            <Info className="w-4 h-4 text-[#008BC5] shrink-0" /> Cách phát hiện
          </summary>
          <ul className="mt-2 space-y-1.5 text-sm text-[#475569] list-disc pl-5">
            <li>
              Cùng sai giống nhau: hai thí sinh chọn cùng một đáp án sai ở từ {t.minSharedWrong} câu trở lên, chiếm từ{' '}
              {Math.round(t.sharedWrongRatio * 100)}% số câu sai của người sai ít hơn. So theo nội dung đáp án nên vẫn đúng khi
              đề đã xáo thứ tự. Đáp án sai mà nhiều người cùng chọn thì không tính.
            </li>
            <li>
              Làm quá nhanh: trung bình dưới {t.fastSecPerQuestion} giây mỗi câu, xét từ {t.minAnsweredForSpeed} câu đã trả lời trở lên.
            </li>
            <li>Kỳ thi dưới {t.minAttemptsForPairs} lượt nộp thì không so cặp vì mẫu quá nhỏ. Bài bị hệ thống tự nộp không được xét.</li>
            <li>Số lần rời trang thi hiện chưa được ghi nhận nên chưa có trong danh sách này.</li>
          </ul>
        </details>

        {exams.length > 1 && (
          <nav aria-label="Chọn kỳ thi" className="space-y-2">
            <p className="text-sm text-[#64748B]">Chọn kỳ thi cần xem ({exams.length} kỳ có dấu hiệu)</p>
            <div className="bg-white rounded-xl border border-[#E2E8F0] divide-y divide-[#E2E8F0] overflow-hidden">
              {exams.slice((eCur - 1) * EXAM_PAGE_SIZE, eCur * EXAM_PAGE_SIZE).map((e) => {
                const active = e.examId === exam.examId;
                return (
                  <button
                    key={e.examId}
                    type="button"
                    onClick={() => pick(e.examId)}
                    aria-pressed={active}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 min-touch-target border-l-4 ${
                      active ? 'bg-[#E6F4FA] border-[#008BC5]' : 'border-transparent hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <span className={`min-w-0 break-words text-base ${active ? 'font-bold text-[#0F172A]' : 'text-[#334155]'}`}>{e.title}</span>
                    <span className="shrink-0 flex items-center gap-1.5 text-sm font-semibold text-[#B7791F]">
                      {e.sharedWrong.length + e.fast.length} dấu hiệu
                      {active && <Check className="w-4 h-4 text-[#008BC5]" aria-hidden="true" />}
                    </span>
                  </button>
                );
              })}
            </div>
            <Pagination page={eCur} pageCount={examPages} onChange={setExamPage} />
          </nav>
        )}
      </div>

      {!exam ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-10 text-center text-[#64748B]">
          <CheckCircle2 className="w-12 h-12 mb-3 mx-auto text-[#22C55E]" />
          <p className="text-base font-medium text-[#334155]">Không phát hiện dấu hiệu bất thường</p>
          <p className="text-base mt-1">
            {data.exams.length === 0 ? 'Chưa có lượt thi chính thức nào được nộp.' : `Đã xét ${data.exams.length} kỳ thi.`}
          </p>
        </div>
      ) : (
        <>
          <p className="text-base text-[#334155]">
            Đang xem: <b className="break-words">{exam.title}</b> · {exam.attempts} lượt đã nộp
          </p>

          <Section
            icon={<Users className="w-5 h-5 text-[#B7791F]" />}
            title="Cùng sai giống nhau"
            hint="Hai thí sinh cùng chọn một đáp án sai ở nhiều câu."
            count={pairs.length}
          >
            {pairs.length === 0 ? (
              <Empty
                skip={exam.attempts < t.minAttemptsForPairs}
                text={exam.attempts < t.minAttemptsForPairs ? `Chưa so cặp: kỳ thi dưới ${t.minAttemptsForPairs} lượt nộp.` : 'Không phát hiện cặp nào.'}
              />
            ) : (
              <>
                <Rows>
                  {pairs.slice((pCur - 1) * PAGE_SIZE, pCur * PAGE_SIZE).map((p) => (
                    <Row
                      key={p.people[0].attemptId + p.people[1].attemptId}
                      title={`${label(p.people[0])} và ${label(p.people[1])}`}
                      sub={[p.people[0].code, p.people[1].code].filter(Boolean).join(' · ')}
                      badge={`Cùng sai ${p.shared}/${p.ofWrong} câu sai`}
                    />
                  ))}
                </Rows>
                <Pagination page={pCur} pageCount={pairPages} onChange={setPairPage} />
              </>
            )}
          </Section>

          <Section
            icon={<Timer className="w-5 h-5 text-[#B7791F]" />}
            title="Làm bài rất nhanh"
            hint="Thời gian làm trung bình mỗi câu thấp bất thường."
            count={fast.length}
          >
            {fast.length === 0 ? (
              <Empty text="Không phát hiện trường hợp nào." />
            ) : (
              <>
                <Rows>
                  {fast.slice((fCur - 1) * PAGE_SIZE, fCur * PAGE_SIZE).map((f) => (
                    <Row
                      key={f.attemptId}
                      title={label(f)}
                      sub={`${f.code ? `${f.code} · ` : ''}${f.answered} câu trong ${dur(f.totalSeconds)}`}
                      badge={`${dec(f.secondsPerQuestion)} giây/câu`}
                    />
                  ))}
                </Rows>
                <Pagination page={fCur} pageCount={fastPages} onChange={setFastPage} />
              </>
            )}
          </Section>
        </>
      )}
    </div>
  );
};
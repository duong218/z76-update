import { useState, useEffect } from 'react';
import { CompetencyRadar } from './CompetencyRadar';

// Thay CompetencyRadar: danh sách thanh ngang, đọc được trên mọi màn hình, không bị cắt nhãn.
// topics: [{ topicId, name, total, rate (0..1 | null), insufficientData }]
// Ngưỡng màu giữ như CompetencyRadar cũ: >=70% tốt, >=50% trung bình, còn lại cần ôn.
export const toneOf = (r) =>
  r >= 0.7
    ? { bar: 'bg-[#22C55E]', text: 'text-[#15803D]', label: 'Tốt' }
    : r >= 0.5
      ? { bar: 'bg-[#F6AD37]', text: 'text-[#B7791F]', label: 'Trung bình' }
      : { bar: 'bg-[#E53E3E]', text: 'text-[#C53030]', label: 'Cần ôn thêm' };

export const CompetencyBars = ({ topics }) => {
  // Yếu nhất lên đầu để người xem thấy ngay chỗ cần chú ý
  const sorted = [...topics].sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2));
  return (
    <ul className="space-y-4">
      {sorted.map((t) => {
        const noData = t.insufficientData || t.rate == null;
        const tone = noData ? null : toneOf(t.rate);
        const pct = noData ? 0 : Math.round(t.rate * 100);
        return (
          <li key={t.topicId ?? t.name}>
            <div className="flex items-start justify-between gap-3">
              <span className="text-base font-medium text-[#0F172A] min-w-0 break-words">{t.name}</span>
              <span className={`text-base font-bold shrink-0 ${tone?.text ?? 'text-[#64748B]'}`}>{noData ? '—' : `${pct}%`}</span>
            </div>
            <div
              className="mt-1.5 h-2.5 rounded-full bg-[#E2E8F0] overflow-hidden"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t.name}
            >
              <div className={`h-full rounded-full ${tone?.bar ?? ''}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-sm text-[#64748B]">
              {noData ? 'Chưa đủ dữ liệu' : tone.label}
              {` · ${t.total} câu`}
            </p>
          </li>
        );
      })}
    </ul>
  );
};

// Chỉ mount radar khi màn hình >= md (khớp mốc ẩn/hiện tab của Dashboard) để recharts không đo khung 0px trên mobile.
const useIsDesktop = () => {
  const q = '(min-width: 768px)';
  const [v, setV] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setV(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return v;
};

/** Desktop: radar + thanh. Mobile: chỉ thanh. */
export const CompetencyView = ({ topics }) => {
  const desktop = useIsDesktop();
  return (
    <div className="space-y-5">
      {desktop && <CompetencyRadar topics={topics} />}
      <CompetencyBars topics={topics} />
    </div>
  );
};
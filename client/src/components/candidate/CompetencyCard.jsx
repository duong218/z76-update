import { useState, useEffect } from 'react';
import { Target, Loader2, AlertCircle } from 'lucide-react';
import { fetchMyCompetency } from '../../services/analytics.service';
import { CompetencyView } from '../CompetencyBars';

/** Bản đồ năng lực cá nhân theo chủ đề (thi chính thức + luyện tập), hiển thị trên Dashboard thí sinh. */
export const CompetencyCard = ({ onPracticeTopic }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyCompetency()
      .then((res) => {
        if (cancelled) return;
        if (res.success) setData(res.data);
        else setError(res.message || 'Không tải được bản đồ năng lực');
      })
      .catch((err) => !cancelled && setError(err.message || 'Không tải được bản đồ năng lực'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const weakest = (data?.weakest ?? []).slice(0, 3);

  return (
    <section className="bg-white rounded-xl shadow-z176 border border-slate-200 overflow-hidden">
      <div className="px-4 py-4 sm:px-6 border-b border-slate-200 bg-slate-50">
        <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
          <Target className="w-5 h-5 text-[#008BC5] shrink-0" />
          Bản đồ năng lực
        </h2>
        <p className="text-sm text-[#64748B] mt-0.5">Tỷ lệ trả lời đúng theo chủ đề, gộp kết quả thi chính thức và luyện tập.</p>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {loading && (
          <div className="flex items-center justify-center py-8 text-[#64748B]">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-[#C53030] text-base">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {data && data.topics.length === 0 && (
          <p className="text-base text-[#64748B] text-center py-6">
            Chưa có dữ liệu. Hãy luyện tập hoặc tham gia thi để xem bản đồ năng lực của bạn.
          </p>
        )}

        {data && data.topics.length > 0 && (
          <>
            {weakest.length > 0 && (
              <div className="rounded-lg bg-[#FFF7E6] border border-[#F6AD37]/40 p-4 space-y-3">
                <p className="text-base font-semibold text-[#0F172A]">Nên ôn thêm</p>
                {weakest.map((t) => (
                  <div key={t.topicId} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className="text-base text-[#334155] min-w-0 break-words">
                      {t.name} · <b>{Math.round(t.rate * 100)}%</b>
                    </span>
                    {onPracticeTopic && (
                      <button
                        onClick={() => onPracticeTopic(t.topicId)}
                        className="w-full sm:w-auto px-4 py-2.5 bg-[#008BC5] hover:bg-[#0079AB] text-white font-semibold rounded-lg text-base min-touch-target shrink-0"
                      >
                        Luyện ngay
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <CompetencyView topics={data.topics} />
          </>
        )}
      </div>
    </section>
  );
};
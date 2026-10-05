import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, FileCheck2, CheckCircle2, XCircle, ServerCrash, RefreshCw, Award } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchOverviewStats } from '../../services/report.service';

// Tab Tổng quan cho Người duyệt đề (leader). Dùng đúng API /reports/overview
// (report.service.js -> fetchOverviewStats), trả về:
// { totalSubmissions, totalCandidates, passedCount, failedCount, passRate, avgScore }
// — không dùng thêm field nào khác.

const PASS_COLOR = '#22C55E';
const FAIL_COLOR = '#E53E3E';

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const percentOf = (value, total) => (total > 0 ? ((value / total) * 100).toFixed(1) : '0.0');

// ---------- Skeleton ----------
const OverviewSkeleton = () => (
  <div className="space-y-6" role="status" aria-label="Đang tải dữ liệu tổng quan">
    <div className="h-6 w-40 bg-slate-200 rounded animate-pulse" />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white p-5 rounded-xl border border-[#E2E8F0] animate-pulse">
          <div className="h-10 w-10 bg-slate-200 rounded-xl mb-3" />
          <div className="h-4 w-24 bg-slate-200 rounded mb-2" />
          <div className="h-8 w-16 bg-slate-200 rounded" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 h-80 bg-white rounded-xl border border-[#E2E8F0] animate-pulse" />
      <div className="h-80 bg-white rounded-xl border border-[#E2E8F0] animate-pulse" />
    </div>
  </div>
);

// ---------- Thẻ số liệu ----------
const StatCard = ({ label, value, caption, icon: Icon, accent, iconBg }) => (
  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-z176 p-4 sm:p-5 flex flex-col">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: iconBg }}>
        <Icon className="w-5 h-5" style={{ color: accent }} aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-[#334155] leading-tight">{label}</p>
    </div>
    <p className="text-3xl font-bold text-[#0F172A] mt-4 tabular-nums">{value}</p>
    {caption && <p className="text-sm text-[#64748B] mt-1">{caption}</p>}
  </div>
);

export const OverviewTab = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stats, setStats] = useState(null);
  const mountedRef = useRef(true);

  // Một hàm tải dùng chung cho lần đầu và nút "Làm mới" / "Thử lại"
  const loadData = useCallback(() => {
    setLoading(true);
    setError(false);
    fetchOverviewStats()
      .then((res) => {
        if (!mountedRef.current) return;
        if (res?.success) {
          setStats(res.data);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (mountedRef.current) setError(true);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, [loadData]);

  // Lần đầu chưa có dữ liệu -> skeleton. Lần làm mới sau đó giữ nguyên số liệu cũ, tránh nháy màn hình.
  if (loading && !stats) return <OverviewSkeleton />;

  // Giữ đúng điều kiện bản gốc (error || !stats): chưa có dữ liệu thì luôn hiện khối lỗi
  if (!stats) {
    return (
      <div role="alert" className="p-6 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-xl text-[#C53030]">
        <div className="flex items-center gap-3">
          <ServerCrash className="w-5 h-5 shrink-0" aria-hidden="true" />
          <p className="font-medium text-base">Không tải được dữ liệu tổng quan. Vui lòng thử lại.</p>
        </div>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2.5 bg-[#334155] hover:bg-[#1e293b] text-white rounded-lg text-base font-semibold min-touch-target focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008BC5]"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const totalSubmissions = toNumber(stats.totalSubmissions);
  const totalCandidates = toNumber(stats.totalCandidates);
  const passedCount = toNumber(stats.passedCount);
  const failedCount = toNumber(stats.failedCount);
  const passRate = toNumber(stats.passRate);
  const hasSubmissions = totalSubmissions > 0;

  const pieData = [
    { name: 'Đạt', value: passedCount, color: PASS_COLOR },
    { name: 'Không đạt', value: failedCount, color: FAIL_COLOR },
  ];

  const avgPerCandidate = totalCandidates > 0 ? (totalSubmissions / totalCandidates).toFixed(1) : null;

  // Chỉ dùng 5 màu chức năng của design system (xanh dương / xanh lá / đỏ / vàng-cam / xám)
  const summaryCards = [
    {
      label: 'Tổng số thí sinh',
      value: totalCandidates,
      caption: '',
      icon: Users,
      iconBg: '#EAF6FF',
      accent: '#008BC5',
    },
    {
      label: 'Tổng lượt nộp bài',
      value: totalSubmissions,
      caption: avgPerCandidate ? `Trung bình ${avgPerCandidate} lượt / thí sinh` : '',
      icon: FileCheck2,
      iconBg: '#F6F8FA',
      accent: '#334155',
    },
    {
      label: 'Số lượt Đạt',
      value: passedCount,
      caption: `${percentOf(passedCount, totalSubmissions)}% tổng lượt nộp`,
      icon: CheckCircle2,
      iconBg: '#F0FDF4',
      accent: PASS_COLOR,
    },
    {
      label: 'Số lượt Không đạt',
      value: failedCount,
      caption: `${percentOf(failedCount, totalSubmissions)}% tổng lượt nộp`,
      icon: XCircle,
      iconBg: '#FEECEC',
      accent: FAIL_COLOR,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Tiêu đề + làm mới */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-[#0F172A]">Thống kê nhanh</h3>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-sm font-medium text-[#334155] hover:bg-slate-50 disabled:opacity-60 min-touch-target focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008BC5]"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Làm mới
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#FEECEC] text-[#C53030] text-sm font-medium">
          <ServerCrash className="w-4 h-4 shrink-0" aria-hidden="true" />
          Không làm mới được dữ liệu. Đang hiển thị số liệu lần tải trước.
        </div>
      )}

      {/* 4 thẻ số liệu */}
      <div className="animate-fade-in-up grid grid-cols-2 lg:grid-cols-4 gap-4" style={{ '--stagger-delay': '0ms' }}>
        {summaryCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="animate-fade-in-up grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ '--stagger-delay': '120ms' }}>
        {/* Biểu đồ tròn: điểm nhấn của trang — tỷ lệ đạt nằm giữa vòng */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#E2E8F0] shadow-z176 p-5">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <p className="text-base font-semibold text-[#0F172A]">Tỷ lệ Đạt / Không đạt</p>
            <p className="text-sm text-[#64748B]">Tổng {totalSubmissions} lượt nộp bài</p>
          </div>

          {!hasSubmissions ? (
            <div className="py-16 text-center text-[#64748B] text-base">
              Chưa có kết quả thi. Số liệu sẽ xuất hiện khi có thí sinh nộp bài.
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="relative h-56 sm:h-64 w-full sm:w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={2}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, color: '#0F172A' }}
                      formatter={(value, name) => [`${value} lượt`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Số ở giữa vòng tròn */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-bold text-[#0F172A] tabular-nums">{passRate}%</span>
                  <span className="text-sm text-[#64748B]">Tỷ lệ đạt</span>
                </div>
              </div>

              {/* Chú giải kèm số lượt và phần trăm */}
              <ul className="w-full sm:w-1/2 space-y-3">
                {pieData.map((item) => (
                  <li
                    key={item.name}
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]"
                  >
                    <span className="flex items-center gap-2.5 text-base font-medium text-[#334155]">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} aria-hidden="true" />
                      {item.name}
                    </span>
                    <span className="text-right">
                      <span className="block text-base font-bold text-[#0F172A] tabular-nums">{item.value} lượt</span>
                      <span className="block text-sm text-[#64748B] tabular-nums">{percentOf(item.value, totalSubmissions)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Chỉ số phụ: tỷ lệ đạt + điểm trung bình */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-z176 p-5 flex flex-col justify-center gap-6">
          <div>
            <p className="text-sm font-medium text-[#334155]">Tỷ lệ Đạt</p>
            <p className="text-3xl font-bold text-[#22C55E] mt-1 tabular-nums">{stats.passRate}%</p>
            <div
              className="mt-3 h-2 rounded-full bg-[#E2E8F0] overflow-hidden"
              role="progressbar"
              aria-valuenow={passRate}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Tỷ lệ đạt"
            >
              <div className="h-full rounded-full bg-[#22C55E]" style={{ width: `${Math.min(Math.max(passRate, 0), 100)}%` }} />
            </div>
          </div>

          <div className="border-t border-[#E2E8F0]" />

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FFF7E6] flex items-center justify-center shrink-0">
              <Award className="w-5 h-5 text-[#F6AD37]" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#334155]">Điểm trung bình</p>
              <p className="text-3xl font-bold text-[#0F172A] mt-0.5 tabular-nums">{stats.avgScore}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
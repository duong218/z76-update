import { useState, useEffect } from 'react';
import { Users, FileCheck2, CheckCircle2, XCircle, ServerCrash } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { fetchOverviewStats } from '../../services/report.service';

// Tab Tổng quan cho Người duyệt đề (leader). Dùng đúng API /reports/overview
// (report.service.js -> fetchOverviewStats), trả về:
// { totalSubmissions, totalCandidates, passedCount, failedCount, passRate, avgScore }
// — khớp đúng reportService.getOverviewStats() ở server, không bịa field nào khác.

const PASS_COLOR = '#22C55E';
const FAIL_COLOR = '#E53E3E';

export const OverviewTab = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetchOverviewStats()
      .then((res) => {
        if (cancelled) return;
        if (res?.success) {
          setStats(res.data);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadData = () => {
    setLoading(true);
    setError(false);
    fetchOverviewStats()
      .then((res) => {
        if (res?.success) {
          setStats(res.data);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  if (loading) {
    return (
      <div className="space-y-6">
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
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-6 bg-[#FEECEC] border border-[#E53E3E]/30 rounded-xl text-[#C53030]">
        <div className="flex items-center gap-3">
          <ServerCrash className="w-5 h-5 shrink-0" />
          <p className="font-medium text-base">Không tải được dữ liệu tổng quan. Vui lòng thử lại.</p>
        </div>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2.5 bg-[#334155] hover:bg-[#1e293b] text-white rounded-lg text-base font-semibold min-touch-target"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const hasSubmissions = stats.totalSubmissions > 0;
  const pieData = [
    { name: 'Đạt', value: stats.passedCount, color: PASS_COLOR },
    { name: 'Không đạt', value: stats.failedCount, color: FAIL_COLOR },
  ];

  // Chỉ dùng đúng 5 màu chức năng của design system (xanh dương/xanh lá/đỏ/vàng-cam/xám)
  // — bỏ purple-400 ở bản trước (ngoài bảng màu quy định).
  const summaryCards = [
    { label: 'Tổng số thí sinh', value: stats.totalCandidates, icon: Users, iconBg: '#EAF6FF', iconColor: '#008BC5' },
    { label: 'Tổng lượt nộp bài', value: stats.totalSubmissions, icon: FileCheck2, iconBg: '#F6F8FA', iconColor: '#334155' },
    { label: 'Số lượt Đạt', value: stats.passedCount, icon: CheckCircle2, iconBg: '#F0FDF4', iconColor: '#22C55E' },
    { label: 'Số lượt Không đạt', value: stats.failedCount, icon: XCircle, iconBg: '#FEECEC', iconColor: '#E53E3E' },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-[#0F172A]">Thống kê nhanh</h3>

      {/* MỚI — animate-fade-in-up: đồng bộ hiệu ứng xuất hiện khi tab vừa tải
          xong, cùng pattern với OverviewTab.jsx bên Admin. */}
      <div className="animate-fade-in-up grid grid-cols-2 lg:grid-cols-4 gap-4" style={{ '--stagger-delay': '0ms' }}>
        {summaryCards.map(({ label, value, icon: Icon, iconBg, iconColor }) => (
          <div key={label} className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-z176">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: iconBg }}>
              <Icon className="w-5 h-5" style={{ color: iconColor }} />
            </div>
            <p className="text-sm text-[#334155] font-medium">{label}</p>
            <p className="text-2xl font-bold text-[#0F172A] mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="animate-fade-in-up grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ '--stagger-delay': '180ms' }}>
        {/* Biểu đồ tròn Đạt/Không đạt */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-z176">
          <p className="text-base font-semibold text-[#334155] mb-3">Tỷ lệ Đạt / Không đạt</p>
          {!hasSubmissions ? (
            <div className="py-10 text-center text-[#64748B] text-base">Chưa có dữ liệu kết quả thi.</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, color: '#0F172A' }}
                    formatter={(value, name) => [`${value} lượt`, name]}
                  />
                  <Legend wrapperStyle={{ color: '#334155', fontSize: 14 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chỉ số phụ: tỷ lệ đạt % + điểm trung bình */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-z176 flex flex-col justify-center gap-6">
          <div>
            <p className="text-sm text-[#334155] font-medium">Tỷ lệ Đạt</p>
            <p className="text-3xl font-bold text-[#22C55E] mt-1">{stats.passRate}%</p>
          </div>
          <div>
            <p className="text-sm text-[#334155] font-medium">Điểm trung bình</p>
            <p className="text-3xl font-bold text-[#F6AD37] mt-1">{stats.avgScore}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
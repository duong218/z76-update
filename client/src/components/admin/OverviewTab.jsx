import { useState, useEffect } from 'react';
import { Users, Shield, FileCheck, ClipboardList, GraduationCap, Cloud, Loader2, CheckCircle, ServerCrash } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { fetchOverviewStats, triggerBackup } from '../../services/admin.service';

const ROLE_META = {
  admin: { label: 'Quản trị viên', icon: Shield, color: 'purple' },
  leader: { label: 'Người duyệt đề', icon: FileCheck, color: 'blue' },
  examiner: { label: 'Người ra đề', icon: ClipboardList, color: 'amber' },
  candidate: { label: 'Người dự thi', icon: GraduationCap, color: 'green' },
};

const COLOR_CLASSES = {
  purple: 'bg-purple-100 text-purple-600',
  blue: 'bg-[#008BC5]/10 text-[#008BC5]',
  amber: 'bg-amber-100 text-amber-600',
  green: 'bg-[#22C55E]/10 text-[#22C55E]',
};

// Bảng màu dùng cho cột biểu đồ — giữ đúng 5 màu chức năng của design-system.md,
// không thêm màu trang trí ngoài hệ thống (tím ở đây chỉ để phân biệt role admin
// trên card, không phải màu chức năng — trên biểu đồ dùng lại xanh chính làm
// màu cột duy nhất để tránh việc mỗi cột 1 màu gây rối mắt với người 30–60 tuổi).
const CHART_BAR_COLOR = '#008BC5';

export const OverviewTab = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupResult, setBackupResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchOverviewStats()
      .then(data => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleBackup = async () => {
    setBackupLoading(true);
    setBackupResult(null);
    try {
      const res = await triggerBackup();
      setBackupResult(res);
    } catch {
      setBackupResult({ success: false, message: 'Backup thất bại' });
    } finally {
      setBackupLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-40 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-pulse">
              <div className="h-10 w-10 bg-slate-200 rounded-lg mb-3" />
              <div className="h-4 w-24 bg-slate-200 rounded mb-2" />
              <div className="h-8 w-16 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-lg p-4 flex items-center gap-3">
        <ServerCrash className="w-5 h-5 shrink-0 text-[#E53E3E]" />
        <p className="font-medium">Không tải được dữ liệu tổng quan. Vui lòng thử lại.</p>
      </div>
    );
  }

  const roleEntries = Object.entries(ROLE_META).map(([code, meta]) => ({
    code,
    ...meta,
    count: stats.usersByRole?.[code] || 0,
  }));

  const chartData = roleEntries.map((r) => ({ label: r.label, count: r.count }));
  const hasUsers = stats.totalUsers > 0;

  const activeExam = stats.activeExam;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-bold text-[#0F172A]">Thống kê nhanh</h3>

        <div className="flex flex-col items-end">
          <button
            onClick={handleBackup}
            disabled={backupLoading}
            className="flex items-center gap-2 px-4 py-2 bg-[#F6AD37] text-white rounded-lg font-medium hover:bg-[#B45309] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {backupLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Cloud className="w-5 h-5" />}
            <span>Backup dữ liệu</span>
          </button>
          <span className="text-xs text-slate-500 mt-1 italic">Demo: lưu tạm trên Google Drive</span>
        </div>
      </div>

      {/* Kết quả backup — dùng đúng 2 màu chức năng (xanh lá/đỏ) theo design-system,
          nền nhạt + viền cùng tông để tương phản cao, luôn kèm icon + chữ mô tả rõ ràng */}
      {backupResult && (
        <div
          className={`p-4 rounded-lg flex items-start gap-3 border ${
            backupResult.success
              ? 'bg-[#F0FDF4] border-[#22C55E]/40 text-[#0F172A]'
              : 'bg-[#FEECEC] border-[#E53E3E]/40 text-[#0F172A]'
          }`}
        >
          {backupResult.success ? (
            <CheckCircle className="w-5 h-5 shrink-0 text-[#16A34A]" />
          ) : (
            <ServerCrash className="w-5 h-5 shrink-0 text-[#C53030]" />
          )}
          <div>
            <p className="font-medium">{backupResult.message}</p>
            {backupResult.downloadUrl && (
              <a
                href={backupResult.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline mt-1 block text-[#16A34A] hover:text-[#22C55E]"
              >
                Xem file trên Google Drive
              </a>
            )}
          </div>
        </div>
      )}

      {/* Tổng số tài khoản + kỳ thi đang diễn ra */}
      {/* MỚI — Hiệu ứng fade-in-up so le (stagger) khi dashboard vừa tải xong
          dữ liệu. --stagger-delay tính theo index * 60ms để các card xuất
          hiện lần lượt thay vì cùng lúc — cảm giác mượt và "có chủ đích" hơn.
          Thuần CSS (xem animate-fade-in-up trong index.css), không dùng
          Motion cho phần này để giữ nhẹ khi danh sách dài. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className="animate-fade-in-up bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors"
          style={{ '--stagger-delay': '0ms' }}
        >
          <div className="w-12 h-12 bg-[#008BC5]/10 text-[#008BC5] rounded-xl flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Tổng số tài khoản</p>
            <p className="text-2xl font-bold text-[#0F172A]">{stats.totalUsers}</p>
          </div>
        </div>

        <div
          className="animate-fade-in-up bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors"
          style={{ '--stagger-delay': '60ms' }}
        >
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${activeExam ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-slate-100 text-slate-400'}`}>
            <FileCheck className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-slate-500 font-medium">Kỳ thi đang diễn ra</p>
            {activeExam ? (
              <p className="text-base font-bold text-[#0F172A] truncate" title={activeExam.title}>
                {activeExam.title}
              </p>
            ) : (
              <p className="text-base font-medium text-slate-400">Không có kỳ thi nào</p>
            )}
          </div>
        </div>
      </div>

      {/* Phân bổ tài khoản theo vai trò */}
      <div>
        <p className="text-sm font-medium text-slate-500 mb-3">Tài khoản theo vai trò</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {roleEntries.map(({ code, label, icon: Icon, color, count }, index) => (
            <div
              key={code}
              className="animate-fade-in-up bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-colors"
              style={{ '--stagger-delay': `${120 + index * 60}ms` }}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${COLOR_CLASSES[color]}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
              <p className="text-xl font-bold text-[#0F172A]">{count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* MỚI — Biểu đồ cột phân bổ tài khoản theo vai trò, trực quan hóa các
          con số ở bảng card phía trên. Chỉ 1 màu cột (xanh chính) theo đúng
          nguyên tắc "càng ít màu càng dễ nhớ" của design-system.md — không tô
          mỗi cột 1 màu khác nhau. */}
      <div className="animate-fade-in-up bg-white p-5 rounded-xl border border-slate-200 shadow-sm" style={{ '--stagger-delay': '360ms' }}>
        <p className="text-sm font-medium text-slate-500 mb-3">Biểu đồ phân bổ tài khoản theo vai trò</p>
        {!hasUsers ? (
          <div className="py-10 text-center text-slate-400 text-sm">Chưa có tài khoản nào trong hệ thống.</div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#334155', fontSize: 13 }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#334155', fontSize: 13 }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8 }}
                  formatter={(value) => [`${value} tài khoản`, 'Số lượng']}
                />
                <Bar dataKey="count" name="Số tài khoản" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={CHART_BAR_COLOR} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};
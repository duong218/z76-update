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
  LabelList,
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

// Biểu đồ dùng 1 màu cột duy nhất (xanh chính) theo design-system.md.
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
      <div className="space-y-6" role="status" aria-label="Đang tải dữ liệu tổng quan">
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
      <div role="alert" className="bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-lg p-4 flex items-center gap-3">
        <ServerCrash className="w-5 h-5 shrink-0 text-[#E53E3E]" aria-hidden="true" />
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
      {/* Tiêu đề + nút backup. Mobile: nút chiếm trọn chiều ngang để dễ bấm */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-[#0F172A]">Thống kê nhanh</h3>

        <div className="flex flex-col items-stretch sm:items-end w-full sm:w-auto">
          <button
            onClick={handleBackup}
            disabled={backupLoading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-[#F6AD37] text-white rounded-lg font-semibold hover:bg-[#B45309] transition-colors disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008BC5]"
          >
            {backupLoading ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Cloud className="w-5 h-5" aria-hidden="true" />}
            <span>Backup dữ liệu</span>
          </button>
          <span className="text-xs text-slate-500 mt-1.5 sm:text-right">Demo: lưu tạm trên Google Drive</span>
        </div>
      </div>

      {/* Kết quả backup — 2 màu chức năng (xanh lá/đỏ), luôn kèm icon + chữ mô tả */}
      {backupResult && (
        <div
          role={backupResult.success ? 'status' : 'alert'}
          className={`p-4 rounded-lg flex items-start gap-3 border ${
            backupResult.success
              ? 'bg-[#F0FDF4] border-[#22C55E]/40 text-[#0F172A]'
              : 'bg-[#FEECEC] border-[#E53E3E]/40 text-[#0F172A]'
          }`}
        >
          {backupResult.success ? (
            <CheckCircle className="w-5 h-5 shrink-0 text-[#16A34A]" aria-hidden="true" />
          ) : (
            <ServerCrash className="w-5 h-5 shrink-0 text-[#C53030]" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className="font-medium break-words">{backupResult.message}</p>
            {backupResult.downloadUrl && (
              <a
                href={backupResult.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline mt-1 inline-block py-1 text-[#16A34A] hover:text-[#22C55E]"
              >
                Xem file trên Google Drive
              </a>
            )}
          </div>
        </div>
      )}

      {/* Tổng số tài khoản + kỳ thi đang diễn ra */}
      <div className="animate-fade-in-up grid grid-cols-1 md:grid-cols-2 gap-4" style={{ '--stagger-delay': '0ms' }}>
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-z176 flex items-center gap-4">
          <div className="w-12 h-12 bg-[#008BC5]/10 text-[#008BC5] rounded-xl flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm text-[#334155] font-medium">Tổng số tài khoản</p>
            <p className="text-3xl font-bold text-[#0F172A] tabular-nums">{stats.totalUsers}</p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-z176 flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${activeExam ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-slate-100 text-slate-400'}`}>
            <FileCheck className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-[#334155] font-medium">Kỳ thi đang diễn ra</p>
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
      <div className="animate-fade-in-up" style={{ '--stagger-delay': '120ms' }}>
        <p className="text-sm font-semibold text-[#334155] mb-3">Tài khoản theo vai trò</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {roleEntries.map(({ code, label, icon: Icon, color, count }) => (
            <div key={code} className="bg-white p-4 rounded-xl border border-slate-200 shadow-z176">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${COLOR_CLASSES[color]}`}>
                <Icon className="w-5 h-5" aria-hidden="true" />
              </div>
              <p className="text-sm text-[#334155] font-medium leading-tight">{label}</p>
              <p className="text-2xl font-bold text-[#0F172A] mt-1 tabular-nums">{count}</p>
              {hasUsers && (
                <p className="text-xs text-[#64748B] mt-0.5 tabular-nums">
                  {((count / stats.totalUsers) * 100).toFixed(0)}% tổng tài khoản
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Biểu đồ phân bổ — dạng cột ngang để nhãn vai trò không bị chồng chữ trên mobile */}
      <div className="animate-fade-in-up bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-z176" style={{ '--stagger-delay': '240ms' }}>
        <p className="text-base font-semibold text-[#0F172A] mb-3">Phân bổ tài khoản theo vai trò</p>
        {!hasUsers ? (
          <div className="py-10 text-center text-slate-500 text-sm">Chưa có tài khoản nào trong hệ thống.</div>
        ) : (
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: '#334155', fontSize: 13 }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={104}
                  tick={{ fill: '#334155', fontSize: 13 }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: '#F1F5F9' }}
                  contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8 }}
                  formatter={(value) => [`${value} tài khoản`, 'Số lượng']}
                />
                <Bar dataKey="count" name="Số tài khoản" radius={[0, 6, 6, 0]} barSize={26}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={CHART_BAR_COLOR} />
                  ))}
                  <LabelList dataKey="count" position="right" fill="#0F172A" fontSize={13} fontWeight={600} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};
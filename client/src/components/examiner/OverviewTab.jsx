import { useState, useEffect } from 'react';
import { BookOpen, FolderOpen, Building, FileSignature, ServerCrash } from 'lucide-react';
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
import {
  fetchQuestions,
  fetchTopics,
  fetchDepartments,
  fetchMyExamProposals,
} from '../../services/examiner.service';

// MỚI — Tab Tổng quan cho Người ra đề. Không có sẵn API tổng hợp riêng nên
// dùng lại đúng các API đã có (fetchQuestions với limit=1 chỉ để lấy
// pagination.total, fetchTopics, fetchDepartments, fetchMyExamProposals) rồi
// tự tính số liệu ở client — không bịa thêm field/API nào không tồn tại.

// Nhãn hiển thị + thứ tự cố định cho trạng thái đề xuất kỳ thi — khớp đúng
// enum EXAM_STATUS thật ở server/src/models/constants.js (draft,
// pending_review, rejected, approved, published, archived). Sắp theo đúng
// vòng đời (nháp -> chờ duyệt -> (từ chối|duyệt) -> phát hành -> lưu trữ) để
// biểu đồ đọc như 1 phễu quy trình, thay vì thứ tự ngẫu nhiên xuất hiện
// trong dữ liệu.
const STATUS_ORDER = ['draft', 'pending_review', 'rejected', 'approved', 'published', 'archived'];
const STATUS_META = {
  draft: { label: 'Bản nháp', color: '#64748B' },
  pending_review: { label: 'Chờ duyệt', color: '#F6AD37' },
  approved: { label: 'Đã duyệt', color: '#22C55E' },
  rejected: { label: 'Bị từ chối', color: '#E53E3E' },
  published: { label: 'Đã phát hành', color: '#008BC5' },
  archived: { label: 'Đã lưu trữ', color: '#94A3B8' },
};

function statusMeta(status) {
  return STATUS_META[status] || { label: status || 'Không rõ', color: '#94A3B8' };
}

export const OverviewTab = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    Promise.all([
      fetchQuestions({ limit: 1 }),
      fetchTopics(),
      fetchDepartments(),
      fetchMyExamProposals(),
    ])
      .then(([questionsRes, topics, departments, proposals]) => {
        if (cancelled) return;
        setData({
          totalQuestions: questionsRes?.pagination?.total ?? 0,
          totalTopics: Array.isArray(topics) ? topics.length : 0,
          totalDepartments: Array.isArray(departments) ? departments.length : 0,
          proposals: Array.isArray(proposals) ? proposals : [],
        });
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-40 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
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

  if (error || !data) {
    return (
      <div className="bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-lg p-4 flex items-center gap-3">
        <ServerCrash className="w-5 h-5 shrink-0 text-[#E53E3E]" />
        <p className="font-medium">Không tải được dữ liệu tổng quan. Vui lòng thử lại.</p>
      </div>
    );
  }

  // Đếm số đề xuất theo từng trạng thái. Luôn liệt kê đủ 6 trạng thái trong
  // STATUS_ORDER (kể cả trạng thái đang bằng 0) thay vì chỉ vẽ những trạng
  // thái thực sự xuất hiện trong dữ liệu — nếu chỉ vẽ 1-2 cột có dữ liệu
  // giữa 1 biểu đồ rộng thì nhìn rất trống; đủ 6 cột vừa lấp đầy không gian
  // vừa cho thấy toàn cảnh quy trình duyệt đề (bao nhiêu đang chờ duyệt, bị
  // từ chối... ) chỉ trong 1 lần nhìn.
  const statusCounts = data.proposals.reduce((acc, p) => {
    const key = p.status || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const extraStatuses = Object.keys(statusCounts).filter((s) => !STATUS_ORDER.includes(s));
  const chartData = [...STATUS_ORDER, ...extraStatuses].map((status) => ({
    status,
    label: statusMeta(status).label,
    color: statusMeta(status).color,
    count: statusCounts[status] || 0,
  }));
  const hasProposals = data.proposals.length > 0;

  const summaryCards = [
    { label: 'Câu hỏi trong ngân hàng', value: data.totalQuestions, icon: BookOpen, color: 'bg-[#008BC5]/10 text-[#008BC5]' },
    { label: 'Chủ đề', value: data.totalTopics, icon: FolderOpen, color: 'bg-amber-100 text-amber-600' },
    { label: 'Bộ phận / Phòng ban', value: data.totalDepartments, icon: Building, color: 'bg-purple-100 text-purple-600' },
    { label: 'Đề xuất kỳ thi đã tạo', value: data.proposals.length, icon: FileSignature, color: 'bg-[#22C55E]/10 text-[#22C55E]' },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-base sm:text-lg font-bold text-[#0F172A]">Thống kê nhanh</h3>

      {/* MỚI — animate-fade-in-up: đồng bộ hiệu ứng xuất hiện khi tab vừa tải
          xong, cùng pattern với OverviewTab.jsx bên Admin. */}
      <div className="animate-fade-in-up grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" style={{ '--stagger-delay': '0ms' }}>
        {summaryCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-colors">
            <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-xs sm:text-xs text-slate-500 font-medium leading-snug">{label}</p>
            <p className="text-lg sm:text-xl font-bold text-[#0F172A] mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* MỚI — Biểu đồ đề xuất kỳ thi theo trạng thái, giúp Người ra đề thấy
          ngay có bao nhiêu đề xuất đang chờ duyệt / đã duyệt / bị từ chối mà
          không cần mở tab "Đề xuất kỳ thi" để đếm thủ công. Vẽ dạng cột
          ngang, luôn đủ 6 trạng thái (kể cả 0) theo đúng thứ tự vòng đời để
          đọc như 1 phễu quy trình, có nhãn số ngay đầu mỗi cột. */}
      <div className="animate-fade-in-up bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200 shadow-sm" style={{ '--stagger-delay': '180ms' }}>
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-sm font-medium text-slate-500">Đề xuất kỳ thi theo trạng thái</p>
          {hasProposals && (
            <p className="text-xs text-slate-400">Tổng <span className="font-semibold text-slate-600">{data.proposals.length}</span> đề xuất</p>
          )}
        </div>
        {!hasProposals ? (
          <div className="py-10 text-center text-slate-400 text-sm">Bạn chưa tạo đề xuất kỳ thi nào.</div>
        ) : (
          <div className="h-72 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 8, right: 28, bottom: 8, left: 0 }}
                barCategoryGap="28%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: '#334155', fontSize: 12 }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fill: '#334155', fontSize: 12, fontWeight: 500 }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                  width={92}
                />
                <Tooltip
                  cursor={{ fill: '#F1F5F9' }}
                  contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8 }}
                  formatter={(value, _name, props) => [`${value} đề xuất`, props?.payload?.label]}
                />
                <Bar dataKey="count" name="Số đề xuất" radius={[0, 6, 6, 0]} maxBarSize={26}>
                  {chartData.map((entry) => (
                    <Cell key={entry.status} fill={entry.color} fillOpacity={entry.count === 0 ? 0.25 : 1} />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    style={{ fill: '#334155', fontSize: 12, fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};
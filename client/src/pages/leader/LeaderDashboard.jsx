import { LayoutDashboard, Building2, FileBarChart, PieChart, CheckCircle, BookOpen } from 'lucide-react';
import { OverviewTab } from '../../components/leader/OverviewTab';
import { DepartmentReportTab } from '../../components/leader/DepartmentReportTab';
import { ExamReportTab } from '../../components/leader/ExamReportTab';
import { DetailedResultsTab } from '../../components/leader/DetailedResultsTab';
import { ExamReviewTab } from '../../components/leader/ExamReviewTab';

// Xuất ra ngoài để App.jsx dùng lại khi truyền xuống Header.jsx (hiển thị
// trong menu 3 gạch ở mobile), cùng pattern đã áp dụng cho ADMIN_DASHBOARD_TABS
// và EXAMINER_DASHBOARD_TABS.
export const LEADER_DASHBOARD_TABS = [
  { id: 'overview', label: 'Tổng quan', icon: <PieChart className="w-5 h-5" /> },
  { id: 'department', label: 'Theo phòng ban', icon: <Building2 className="w-5 h-5" /> },
  { id: 'exam', label: 'Theo bài thi', icon: <BookOpen className="w-5 h-5" /> },
  { id: 'detailed', label: 'Kết quả chi tiết', icon: <FileBarChart className="w-5 h-5" /> },
  { id: 'review', label: 'Duyệt kỳ thi', icon: <CheckCircle className="w-5 h-5" /> },
];

// activeTab/onTabChange giờ là props từ App.jsx (thay vì state nội bộ) — để
// Header.jsx (menu 3 gạch ở mobile) đọc/đổi được đúng tab đang chọn ở đây.
export const LeaderDashboard = ({ activeTab, onTabChange }) => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 mt-16 min-h-screen">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-2 flex items-center gap-3">
          <LayoutDashboard className="w-8 h-8 text-[#008BC5]" />
          DASHBOARD Người duyệt đề
        </h1>
        <p className="text-slate-500">Báo cáo & Thống kê kết quả thi chuyên môn Z176.</p>
      </div>

      <div className="bg-white rounded-xl shadow-z176 border border-slate-200 overflow-hidden">
        {/* Tab Navigation — CHỈ hiện từ md trở lên. Trên mobile, chuyển hẳn
            sang menu 3 gạch (Header.jsx) để không phải vuốt ngang nữa. */}
        <div className="hidden md:flex overflow-x-auto border-b border-slate-200 bg-slate-50 scrollbar-hide">
          {LEADER_DASHBOARD_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex items-center gap-2 px-6 py-4 font-semibold text-sm transition-colors whitespace-nowrap outline-none
                ${
                  activeTab === tab.id
                    ? 'text-[#008BC5] border-b-2 border-[#008BC5] bg-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-4 md:p-6 bg-slate-50/50 min-h-[400px]">
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'department' && <DepartmentReportTab />}
          {activeTab === 'exam' && <ExamReportTab />}
          {activeTab === 'detailed' && <DetailedResultsTab />}
          {activeTab === 'review' && <ExamReviewTab />}
        </div>
      </div>
    </div>
  );
};
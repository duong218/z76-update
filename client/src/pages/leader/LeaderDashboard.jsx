import { UserInfoCard } from '../../components/UserInfoCard';
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

// activeTab/onTabChange là props từ App.jsx — để Header.jsx (menu 3 gạch ở
// mobile) đọc/đổi được đúng tab đang chọn ở đây.
export const LeaderDashboard = ({ currentUser, activeTab, onTabChange }) => {
  const activeLabel = LEADER_DASHBOARD_TABS.find((t) => t.id === activeTab)?.label;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6 md:py-8 mt-16 min-h-screen">
      {/* Tiêu đề trang */}
      <div className="mb-5 md:mb-6 flex items-start gap-3 md:gap-4">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#EAF6FF] flex items-center justify-center shrink-0">
          <LayoutDashboard className="w-5 h-5 md:w-6 md:h-6 text-[#008BC5]" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] leading-tight">Dashboard Người duyệt đề</h1>
          <p className="text-sm md:text-base text-[#64748B] mt-1">Báo cáo và thống kê kết quả thi chuyên môn Z176.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-z176 border border-slate-200 overflow-hidden">
        {/* Thanh tab — chỉ hiện từ md trở lên. Trên mobile dùng menu 3 gạch (Header.jsx). */}
        <div
          role="tablist"
          aria-label="Các mục báo cáo"
          className="hidden md:flex overflow-x-auto border-b border-slate-200 bg-white px-2 scrollbar-hide"
        >
          {LEADER_DASHBOARD_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                id={`leader-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls="leader-tabpanel"
                onClick={() => onTabChange(tab.id)}
                className={`
                  relative flex items-center gap-2 px-5 py-4 font-semibold text-sm whitespace-nowrap
                  transition-colors outline-none
                  focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#008BC5]
                  ${isActive ? 'text-[#008BC5]' : 'text-slate-500 hover:text-slate-800'}
                `}
              >
                {tab.icon}
                {tab.label}
                {/* Gạch chân tab đang chọn */}
                <span
                  className={`absolute left-3 right-3 bottom-0 h-0.5 rounded-full transition-colors ${
                    isActive ? 'bg-[#008BC5]' : 'bg-transparent'
                  }`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        {/* Mobile: hiện tên mục đang xem vì thanh tab đã ẩn */}
        {activeLabel && (
          <div className="md:hidden px-4 py-3 border-b border-slate-200 bg-white text-sm font-semibold text-[#334155]">
            {activeLabel}
          </div>
        )}

        {/* Nội dung tab — key để mỗi lần đổi tab chạy lại hiệu ứng xuất hiện một lần */}
        <div
          key={activeTab}
          role="tabpanel"
          id="leader-tabpanel"
          aria-labelledby={`leader-tab-${activeTab}`}
          className="animate-fade-in-up p-3 sm:p-4 md:p-6 bg-[#F8FAFC] min-h-[400px]"
          style={{ '--stagger-delay': '0ms' }}
        >
          {activeTab === 'overview' && <UserInfoCard user={currentUser} />}
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
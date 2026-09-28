import { OverviewTab } from '../../components/admin/OverviewTab';
import { AccountTab } from '../../components/admin/AccountTab';
import { AuditLogTab } from '../../components/admin/AuditLogTab';
import { BackupTab } from '../../components/admin/BackupTab';
import { LayoutDashboard, Users, Activity, Database } from 'lucide-react';

// Xuất ra ngoài để App.jsx dùng lại đúng 1 nguồn danh sách tab này khi
// truyền xuống Header.jsx (hiển thị trong menu 3 gạch ở mobile) — tránh
// định nghĩa lặp lại 2 nơi khiến label/icon lệch nhau nếu sau này đổi tab.
export const ADMIN_DASHBOARD_TABS = [
  { id: 'overview', label: 'Tổng quan', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'accounts', label: 'Tài khoản', icon: <Users className="w-5 h-5" /> },
  { id: 'audit', label: 'Nhật ký (Log)', icon: <Activity className="w-5 h-5" /> },
  { id: 'backup', label: 'Sao lưu & Phục hồi', icon: <Database className="w-5 h-5" /> },
];

// activeTab/onTabChange giờ là props từ App.jsx (thay vì state nội bộ) —
// để Header.jsx (menu 3 gạch ở mobile) có thể đọc/đổi được đúng tab đang
// chọn ở đây, tránh 2 nơi giữ 2 state tab riêng biệt lệch nhau.
export const AdminDashboard = ({ currentUser, activeTab, onTabChange }) => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 mt-16 min-h-screen">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-2">BẢNG ĐIỀU KHIỂN QUẢN TRỊ</h1>
        <p className="text-slate-500">Quản lý người dùng và theo dõi hoạt động hệ thống Z176.</p>
      </div>

      <div className="bg-white rounded-xl shadow-z176 border border-slate-200 overflow-hidden">
        {/* Tab Navigation — CHỈ hiện từ md trở lên. Trên mobile, chuyển hẳn
            sang menu 3 gạch (Header.jsx) để không phải vuốt ngang nữa. */}
        <div className="hidden md:flex overflow-x-auto border-b border-slate-200 bg-slate-50 scrollbar-hide">
          {ADMIN_DASHBOARD_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 font-medium text-sm whitespace-nowrap transition-colors border-b-2 outline-none focus:bg-slate-100 ${
                activeTab === tab.id
                  ? 'border-[#008BC5] text-[#008BC5] bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-4 md:p-6 bg-slate-50/50 min-h-[400px]">
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'accounts' && <AccountTab currentUser={currentUser} />}
          {activeTab === 'audit' && <AuditLogTab />}
          {activeTab === 'backup' && <BackupTab />}
        </div>
      </div>
    </div>
  );
};
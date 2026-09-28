import { useState } from 'react';
import { QuestionBankTab } from '../../components/examiner/QuestionBankTab';
import { TopicTab } from '../../components/examiner/TopicTab';
import { DepartmentTab } from '../../components/examiner/DepartmentTab';
import { ExamProposalTab } from '../../components/examiner/ExamProposalTab';
import { OverviewTab } from '../../components/examiner/OverviewTab';
import { StudyDocumentTab } from '../../components/examiner/StudyDocumentTab';
import { LayoutDashboard, BookOpen, FolderOpen, Building, FileSignature, Library } from 'lucide-react';

// Xuất ra ngoài để App.jsx dùng lại khi truyền xuống Header.jsx (hiển thị
// trong menu 3 gạch ở mobile), cùng pattern đã áp dụng cho ADMIN_DASHBOARD_TABS.
export const EXAMINER_DASHBOARD_TABS = [
  { id: 'overview', label: 'Tổng quan', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'questions', label: 'Ngân hàng câu hỏi', icon: <BookOpen className="w-5 h-5" /> },
  { id: 'topics', label: 'Chủ đề', icon: <FolderOpen className="w-5 h-5" /> },
  { id: 'departments', label: 'Bộ phận / Phòng ban', icon: <Building className="w-5 h-5" /> },
  { id: 'proposals', label: 'Đề xuất kỳ thi', icon: <FileSignature className="w-5 h-5" /> },
  { id: 'materials', label: 'Tài liệu ôn tập', icon: <Library className="w-5 h-5" /> },
];

// activeTab/onTabChange giờ là props từ App.jsx (thay vì state nội bộ) — để
// Header.jsx (menu 3 gạch ở mobile) đọc/đổi được đúng tab đang chọn ở đây.
export const ExaminerDashboard = ({ activeTab, onTabChange }) => {
  // Khi bấm "Xem câu hỏi" trên 1 thẻ chủ đề ở tab Chủ đề, hoặc trên 1 thẻ bộ
  // phận ở tab Bộ phận/Phòng ban, lưu filter tương ứng + mốc thời gian
  // (seed) vào đây rồi chuyển sang tab Ngân hàng câu hỏi. Kèm seed để nếu
  // người dùng bấm lại đúng mục cũ lần nữa, QuestionBankTab vẫn nhận biết
  // được đây là 1 yêu cầu áp filter MỚI (không chỉ so sánh id không đổi mà
  // bỏ qua).
  const [questionsFilterSeed, setQuestionsFilterSeed] = useState(null);

  const handleViewQuestionsByTopic = (topicId) => {
    setQuestionsFilterSeed({ topicId, ts: Date.now() });
    onTabChange('questions');
  };

  const handleViewQuestionsByDepartment = (departmentId) => {
    setQuestionsFilterSeed({ departmentId, ts: Date.now() });
    onTabChange('questions');
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-8 mt-14 sm:mt-16 min-h-screen">
      <div className="mb-5 sm:mb-8 px-1">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#0F172A] mb-1.5 sm:mb-2">QUẢN LÝ NGÂN HÀNG ĐỀ THI</h1>
        <p className="text-sm sm:text-base text-slate-500">Soạn thảo, quản lý câu hỏi thi chuyên môn và bộ phận phòng ban.</p>
      </div>

      <div className="bg-white rounded-xl shadow-z176 border border-slate-200 overflow-hidden">
        {/* Tab Navigation — CHỈ hiện từ md trở lên. Trên mobile, chuyển hẳn
            sang menu 3 gạch (Header.jsx) để không phải vuốt ngang nữa. */}
        <div className="hidden md:flex overflow-x-auto border-b border-slate-200 bg-slate-50 scrollbar-hide snap-x snap-mandatory">
          {EXAMINER_DASHBOARD_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 shrink-0 snap-start px-4 sm:px-6 py-3.5 sm:py-4 font-medium text-sm sm:text-sm whitespace-nowrap transition-colors border-b-2 outline-none focus:bg-slate-100 min-h-[48px] ${
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
        <div className="p-3 sm:p-4 md:p-6 bg-slate-50/50 min-h-[400px]">
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'questions' && <QuestionBankTab initialFilter={questionsFilterSeed} />}
          {activeTab === 'topics' && <TopicTab onViewQuestions={handleViewQuestionsByTopic} />}
          {activeTab === 'departments' && <DepartmentTab onViewQuestions={handleViewQuestionsByDepartment} />}
          {activeTab === 'proposals' && <ExamProposalTab />}
          {activeTab === 'materials' && <StudyDocumentTab />}
        </div>
      </div>
    </div>
  );
};
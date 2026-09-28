import { FileText, Clock, HelpCircle, CheckCircle2, ShieldAlert, Award } from 'lucide-react';

export const RegulationsSection = ({ onStartExam }) => {
  return (
    <section id="rules" className="py-6 px-4 bg-slate-50 border-t border-slate-200">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Title */}
        <div className="flex items-center gap-2.5 pb-2 border-b border-slate-300">
          <div className="w-9 h-9 rounded-lg bg-[#008BC5] text-white flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#0F172A]">Quy chế & Thể lệ cuộc thi</h2>
            <p className="text-sm text-[#334155]">Vui lòng đọc kỹ trước khi thực hiện bài thi chính thức</p>
          </div>
        </div>

        {/* Highlight Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-white p-4 rounded-[10px] border border-slate-200 shadow-z176 flex items-start gap-3">
            <Clock className="w-6 h-6 text-[#008BC5] shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-base text-[#0F172A]">Thời gian làm bài</h3>
              <p className="text-sm text-[#334155] font-medium">
                Hệ thống tự động đếm ngược theo đúng số câu hỏi của đề thi được cấp cho bạn.
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-[10px] border border-slate-200 shadow-z176 flex items-start gap-3">
            <HelpCircle className="w-6 h-6 text-[#008BC5] shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-base text-[#0F172A]">Cấu trúc bài thi</h3>
              <p className="text-sm text-[#334155] font-medium">
                Bộ câu hỏi trắc nghiệm (mỗi câu gồm 4 phương án, chọn 1 hoặc nhiều đáp án đúng tuỳ yêu cầu từng câu).
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-[10px] border border-slate-200 shadow-z176 flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-[#22C55E] shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-base text-[#0F172A]">Tỷ lệ đạt yêu cầu</h3>
              <p className="text-sm text-[#334155] font-medium">
                Trả lời đúng từ <strong className="text-[#22C55E] font-bold">60% tổng số câu</strong> trở lên được tính là ĐẠT.
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-[10px] border border-slate-200 shadow-z176 flex items-start gap-3">
            <Award className="w-6 h-6 text-[#008BC5] shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-base text-[#0F172A]">Số lần làm bài</h3>
              <p className="text-sm text-[#334155] font-medium">Mỗi cán bộ/công nhân được làm bài tối đa 2 lần. Hệ thống lưu kết quả cao nhất.</p>
            </div>
          </div>
        </div>

        {/* Detailed Rules List */}
        <div className="bg-white p-4 rounded-[10px] border border-slate-200 shadow-z176 space-y-3">
          <h3 className="font-bold text-base text-[#0F172A] flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#008BC5]" />
            Hướng dẫn thao tác cho công nhân
          </h3>
          <ul className="space-y-2 text-base text-[#334155]">
            <li className="flex items-start gap-2">
              <span className="w-6 h-6 rounded-full bg-[#EAF6FF] text-[#008BC5] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
              <span>Chuẩn bị sẵn <strong>Mã nhân viên</strong> (in trên thẻ công nhân) và chọn đúng Xưởng/Phòng ban làm việc.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-6 h-6 rounded-full bg-[#EAF6FF] text-[#008BC5] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
              <span>Đảm bảo kết nối mạng ổn định (Wifi hoặc 3G/4G). Nếu mất mạng giữa chừng, hệ thống tự động lưu các câu đã tích.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-6 h-6 rounded-full bg-[#EAF6FF] text-[#008BC5] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
              <span>Sau khi hoàn thành toàn bộ các câu hỏi (có thể dùng lưới điều hướng để kiểm tra lại câu chưa làm), nhấn nút <strong>NỘP BÀI THI</strong> để xem kết quả và giấy xác nhận hoàn thành ngay tức thì.</span>
            </li>
          </ul>

          <div className="pt-2">
            <button
              onClick={onStartExam}
              className="w-full min-h-[52px] bg-[#008BC5] text-white font-bold text-base rounded-[10px] hover:bg-[#007ba1] transition-colors flex items-center justify-center gap-2 min-touch-target"
            >
              <span>Đã hiểu quy chế — Bắt đầu vào thi</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
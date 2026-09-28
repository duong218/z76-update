import { PhoneCall, Mail, Building2, MapPin, Headphones } from 'lucide-react';
import { Z176_COMPANY_INFO } from '../data';

export const ContactSection = () => {
  return (
    <section id="contact" className="py-6 px-4 bg-slate-50 border-t border-slate-200">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Title */}
        <div className="flex items-center gap-2.5 pb-2 border-b border-slate-300">
          <div className="w-9 h-9 rounded-lg bg-[#008BC5] text-white flex items-center justify-center shrink-0">
            <PhoneCall className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#0F172A]">Liên hệ & Hỗ trợ kỹ thuật</h2>
            <p className="text-sm text-[#334155]">Giải đáp thắc mắc về tài khoản, mã nhân viên và lỗi thi trực tuyến</p>
          </div>
        </div>

        {/* Contact Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Hotline IT */}
          <div className="bg-white p-4 rounded-[10px] border border-slate-200 shadow-z176 space-y-2">
            <div className="flex items-center gap-2 text-[#008BC5] font-bold text-base">
              <Headphones className="w-5 h-5" />
              <span>Hỗ trợ Kỹ thuật & Mạng (Phòng ban CNTT)</span>
            </div>
            <p className="text-sm text-[#334155]">Hỗ trợ xử lý lỗi không truy cập được bài thi, quên mật khẩu, gián đoạn kết nối mạng.</p>
            <a
              href={`tel:${Z176_COMPANY_INFO.supportHotline}`}
              className="inline-flex items-center justify-center gap-2 w-full min-h-[48px] bg-[#008BC5] text-white font-bold text-base rounded-lg hover:bg-[#007ba1] transition-colors min-touch-target"
            >
              <PhoneCall className="w-5 h-5" />
              <span>Gọi ngay: {Z176_COMPANY_INFO.supportHotline}</span>
            </a>
          </div>

          {/* Hotline HR */}
          <div className="bg-white p-4 rounded-[10px] border border-slate-200 shadow-z176 space-y-2">
            <div className="flex items-center gap-2 text-[#008BC5] font-bold text-base">
              <Building2 className="w-5 h-5" />
              <span>Ban Tổ Chức (Phòng ban Tổ chức - Lao động)</span>
            </div>
            <p className="text-sm text-[#334155]">Hỗ trợ xác minh Mã nhân viên, cấp lại lượt thi do lý do bất khả kháng.</p>
            <a
              href={`mailto:${Z176_COMPANY_INFO.supportEmail}`}
              className="inline-flex items-center justify-center gap-2 w-full min-h-[48px] bg-[#334155] text-white font-bold text-base rounded-lg hover:bg-[#1e293b] transition-colors min-touch-target"
            >
              <Mail className="w-5 h-5 text-[#008BC5]" />
              <span>Gửi Email: {Z176_COMPANY_INFO.supportEmail}</span>
            </a>
          </div>
        </div>

        {/* Location / Address */}
        <div className="bg-white p-4 rounded-[10px] border border-slate-200 shadow-z176 flex items-start gap-3 text-sm text-[#334155]">
          <MapPin className="w-5 h-5 text-[#008BC5] shrink-0 mt-0.5" />
          <div>
            <strong className="text-[#0F172A] font-bold block text-base">{Z176_COMPANY_INFO.name}</strong>
            <span>Địa chỉ: Nhà máy Z176 - Trung Dương, Gia Lâm, Hà Nội</span>
          </div>
        </div>
      </div>
    </section>
  );
};

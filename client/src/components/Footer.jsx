import { Z176_COMPANY_INFO } from '../data';
import { PhoneCall, Mail, MapPin } from 'lucide-react';

export const Footer = () => {
  return (
    <footer className="bg-[#0F172A] text-white py-6 px-4 border-t border-[#334155]/60">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0 p-1">
              <img src="/logo/logo.svg" alt="Logo Z176" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="font-bold text-base text-white">{Z176_COMPANY_INFO.name}</div>
              <div className="text-xs text-[#64748B]">Doanh nghiệp sản xuất thuộc Bộ Quốc phòng · Thành lập {Z176_COMPANY_INFO.foundedDate}</div>
            </div>
          </div>

          <div className="flex flex-col items-center sm:items-end gap-1.5 text-xs text-slate-300">
            <div className="flex items-center gap-4">
              <a href={`tel:${Z176_COMPANY_INFO.supportHotline}`} className="flex items-center gap-1.5 hover:text-[#008BC5]">
                <PhoneCall className="w-4 h-4 text-[#008BC5]" /> {Z176_COMPANY_INFO.supportHotline}
              </a>
              <a href={`mailto:${Z176_COMPANY_INFO.supportEmail}`} className="flex items-center gap-1.5 hover:text-[#008BC5]">
                <Mail className="w-4 h-4 text-[#008BC5]" /> {Z176_COMPANY_INFO.supportEmail}
              </a>
            </div>
            <div className="text-[11px] text-[#64748B]">(kênh hỗ trợ thi trực tuyến)</div>
          </div>
        </div>

        {/* Thông tin liên hệ chính thức của công ty (theo z76.vn) — tách
            riêng khỏi hotline/email hỗ trợ thi ở trên. */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-[#334155]/40 text-xs text-slate-300">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-[#008BC5] shrink-0" />
            <span>{Z176_COMPANY_INFO.officialAddress}</span>
          </div>
          <div className="flex items-center gap-4">
            <a href={`tel:${Z176_COMPANY_INFO.officialPhone}`} className="flex items-center gap-1.5 hover:text-[#008BC5]">
              <PhoneCall className="w-4 h-4 text-[#008BC5]" /> {Z176_COMPANY_INFO.officialPhone}
            </a>
            <a
              href={`https://${Z176_COMPANY_INFO.officialWebsite}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#008BC5]"
            >
              {Z176_COMPANY_INFO.officialWebsite}
            </a>
          </div>
        </div>

        <div className="pt-3 border-t border-[#334155]/40 text-center text-xs text-[#64748B]">
          © 2026 {Z176_COMPANY_INFO.shortName} — Hệ thống thi trực tuyến nội bộ. Bản quyền thuộc Công ty Z176 - Bộ Quốc phòng.
        </div>
      </div>
    </footer>
  );
};
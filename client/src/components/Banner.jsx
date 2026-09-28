import { Z176_COMPANY_INFO } from '../data';
import { Award, ShieldCheck } from 'lucide-react';
import { UnitLogoDisplay } from './UnitLogoDisplay';

export const Banner = ({ unitLogo, activeExam }) => {
  return (
    <section className="pt-18 sm:pt-20 pb-3 sm:pb-6 px-4 flex flex-col justify-center">
      <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
        {/* Unit badge / Organizing Unit Name */}
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/95 border border-slate-300 rounded-lg shadow-z176 mb-2">
          {unitLogo && (
            <UnitLogoDisplay config={unitLogo} sizeClassName="w-5 h-5 sm:w-6 sm:h-6" iconSizeClassName="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          )}
          <span className="text-xs sm:text-base font-semibold text-[#334155] uppercase tracking-wide">
            {Z176_COMPANY_INFO.name}
          </span>
        </div>

        {/* Title H1 - 25px on mobile (24-26px range), 32px on desktop, weight 700 */}
        <h1 className="text-[25px] sm:text-[32px] font-bold text-white leading-snug sm:leading-tight text-center max-w-3xl mb-1.5 drop-shadow-[0_3px_8px_rgba(0,0,0,0.85)]">
          {Z176_COMPANY_INFO.contestTitle}
        </h1>

        {/* Subtitle: ưu tiên hiển thị đúng tên kỳ thi (activeExam.title) — trước
            đây lấy nhầm activeExam.topicId.name (tên chủ đề liên kết), khiến
            tên kỳ thi người tạo gõ vào không hề xuất hiện ở trang chủ. */}
        <h3 className="text-base sm:text-xl font-semibold text-slate-100 mb-2 sm:mb-4 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
          {activeExam?.title || Z176_COMPANY_INFO.contestEdition}
        </h3>

        {/* Chip/Tag description - hidden on mobile to fit above the fold */}
        <div className="hidden sm:flex items-center justify-center gap-3 bg-white/90 border border-[#008BC5]/20 px-4 py-2 rounded-lg shadow-z176 text-sm font-medium text-[#334155]">
          <span className="flex items-center gap-1.5 text-[#008BC5]">
            <ShieldCheck className="w-4 h-4" /> BHLĐ & An toàn
          </span>
          <span className="text-slate-300">•</span>
          <span className="flex items-center gap-1.5 text-[#008BC5]">
            <Award className="w-4 h-4" /> Khen thưởng tập thể
          </span>
        </div>
      </div>
    </section>
  );
};
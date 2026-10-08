import { ChevronLeft, ChevronRight } from 'lucide-react';

const btn =
  'inline-flex items-center gap-1 px-4 py-2.5 rounded-lg border border-[#CBD5E1] bg-white text-base font-semibold text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40 disabled:hover:bg-white min-touch-target';

export const Pagination = ({ page, pageCount, onChange }) =>
  pageCount <= 1 ? null : (
    <nav className="flex items-center justify-between gap-3 pt-1" aria-label="Phân trang">
      <button className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="w-4 h-4" /> Trước
      </button>
      <span className="text-base text-[#334155]">
        Trang <b>{page}</b> / {pageCount}
      </span>
      <button className={btn} disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        Sau <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
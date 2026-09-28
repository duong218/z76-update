import { CheckCircle2, XCircle, AlertTriangle, X } from 'lucide-react';

// Đúng 3/5 màu chức năng đã định nghĩa trong design-system.md — không thêm
// màu ngoài hệ thống. Nền nhạt + viền đậm cùng tông để đạt tương phản cao,
// dễ nhận biết ngay cả khi thoáng qua (phù hợp người 25-55+ tuổi, có thể
// không phân biệt tốt sắc độ) — không chỉ dựa vào màu, luôn có icon + chữ
// "Thành công"/"Lỗi"/"Cảnh báo" đi kèm nội dung.
const VARIANTS = {
  success: {
    bg: '#F0FDF4',
    border: '#22C55E',
    iconColor: '#16A34A', // đậm hơn 1 chút so với #22C55E nền để icon nổi rõ trên nền nhạt
    titleColor: '#0F172A',
    label: 'Thành công',
    Icon: CheckCircle2,
  },
  error: {
    bg: '#FEECEC',
    border: '#E53E3E',
    iconColor: '#C53030',
    titleColor: '#0F172A',
    label: 'Lỗi',
    Icon: XCircle,
  },
  warning: {
    bg: '#FFFBEB',
    border: '#F6AD37',
    iconColor: '#B45309',
    titleColor: '#0F172A',
    label: 'Cảnh báo',
    Icon: AlertTriangle,
  },
};

export function Toast({ message, type = 'success', action, onDismiss }) {
  const variant = VARIANTS[type] ?? VARIANTS.success;
  const { bg, border, iconColor, titleColor, label, Icon } = variant;

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className="w-full rounded-[10px] shadow-z176 border-[1.5px] pointer-events-auto animate-toast-in"
      style={{ backgroundColor: bg, borderColor: border }}
    >
      <div className="p-4 flex items-start gap-3">
        <Icon className="w-6 h-6 shrink-0 mt-0.5" style={{ color: iconColor }} aria-hidden="true" />

        <div className="flex-1 min-w-0">
          {/* Nhãn chữ đi kèm màu — không chỉ dựa vào màu để truyền đạt đúng/sai,
              theo đúng nguyên tắc mục 13 trong design-system.md */}
          <div className="text-sm font-bold" style={{ color: titleColor }}>
            {label}
          </div>
          <div className="text-base font-medium leading-snug mt-0.5" style={{ color: titleColor }}>
            {message}
          </div>

          {action && (
            <button
              onClick={action.onClick}
              className="mt-2 text-base font-bold underline min-touch-target"
              style={{ color: iconColor }}
            >
              {action.label}
            </button>
          )}
        </div>

        <button
          onClick={onDismiss}
          className="shrink-0 p-1.5 -m-1.5 rounded-lg hover:bg-black/5 min-touch-target flex items-center justify-center"
          style={{ color: titleColor }}
          aria-label="Đóng thông báo"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
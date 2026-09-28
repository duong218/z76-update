import { AlertTriangle } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';

// Modal CHẶN thao tác — không có nút X, không đóng khi bấm ra ngoài, không
// đóng bằng phím Esc. Dùng riêng cho trường hợp phiên bị thu hồi do đăng
// nhập nơi khác: người dùng bắt buộc phải bấm "Đăng nhập lại" mới được tiếp
// tục, tránh thao tác nhầm trên dữ liệu cũ đã không còn hợp lệ.
export function SessionRevokedModal({ isOpen, message, onConfirm }) {
  useScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-revoked-title"
    >
      <div className="w-full max-w-sm rounded-[10px] bg-white border-[1.5px] border-[#E53E3E] shadow-z176 p-6">
        <div className="flex flex-col items-center text-center gap-3">
          <AlertTriangle className="w-10 h-10 text-[#E53E3E]" aria-hidden="true" />

          <h2 id="session-revoked-title" className="text-lg font-bold text-[#0F172A]">
            Phiên đăng nhập đã hết hiệu lực
          </h2>

          <p className="text-base font-medium text-slate-600 leading-snug">
            {message}
          </p>

          <button
            onClick={onConfirm}
            className="mt-2 w-full min-touch-target rounded-lg bg-[#008BC5] hover:bg-[#0077AB] text-white text-base font-bold py-3 transition-colors"
          >
            Đăng nhập lại
          </button>
        </div>
      </div>
    </div>
  );
}
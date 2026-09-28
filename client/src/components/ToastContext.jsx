import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Toast } from './Toast';

const ToastContext = createContext(null);

// Toast tự đóng sau 6s cho type 'error'/'warning' (đủ thời gian đọc câu dài về
// phiên đăng nhập cho người 30-60 tuổi, không vội như toast thông thường 3s),
// và 4s cho 'success' (thông báo ngắn, không cần đọc lâu).
const AUTO_DISMISS_MS = { success: 4000, error: 6000, warning: 6000 };

let idSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  // type: 'success' | 'error' | 'warning'
  // Dùng cho mọi thông báo toàn cục trong app (không riêng gì luồng thi):
  // đúng/thành công -> 'success' (xanh lá), sai/lỗi -> 'error' (đỏ), cần chú ý
  // nhưng chưa phải lỗi hẳn -> 'warning' (vàng-cam).
  const showToast = useCallback(
    (message, type = 'success', options = {}) => {
      const id = ++idSeq;
      setToasts((prev) => [...prev, { id, message, type, action: options.action }]);

      const duration = options.duration ?? AUTO_DISMISS_MS[type] ?? AUTO_DISMISS_MS.success;
      if (duration > 0) {
        const timer = setTimeout(() => dismissToast(id), duration);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismissToast],
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}

      {/* Đặt cố định góc trên, giữa màn hình trên mobile để không bị bottom
          action bar của màn thi che mất (bottom bar đã chiếm đáy màn hình) */}
      <div
        className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-24px)] max-w-md space-y-2 px-0 sm:px-4"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <Toast key={t.id} {...t} onDismiss={() => dismissToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast phải được gọi bên trong <ToastProvider>');
  }
  return ctx;
}
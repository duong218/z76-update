import { useEffect } from 'react';
import { getLenisInstance } from '../lib/lenis-instance';

/**
 * Khoá cuộn trang nền khi có modal đang mở — chặn cả:
 * 1) Cuộn chuột/touch qua Lenis (lenis.stop()/lenis.start())
 * 2) Cuộn native qua thanh scrollbar/phím mũi tên (body.style.overflow)
 * Dùng cho MỌI modal dạng fixed overlay trong app — truyền vào true/false
 * tương ứng trạng thái đóng/mở của modal đó.
 */
export function useScrollLock(isLocked) {
  useEffect(() => {
    if (!isLocked) return undefined;

    const lenis = getLenisInstance();
    lenis?.stop();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      lenis?.start();
      document.body.style.overflow = previousOverflow;
    };
  }, [isLocked]);
}
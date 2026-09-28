/**
 * Registry đơn giản (module-level, KHÔNG phải React Context) giữ tham chiếu
 * tới instance Lenis đang chạy — do App.jsx tạo. Dùng module-level thay vì
 * Context vì các modal cần dùng nó (ConfirmDialog, LoginModal...) nằm ở
 * nhiều vị trí khác nhau trong cây component — có cả vị trí nằm TRÊN App.jsx
 * (ConfirmProvider bọc ngoài App) nên không lấy được qua Context con -> cha.
 */
let lenisInstance = null;

export function setLenisInstance(instance) {
  lenisInstance = instance;
}

export function getLenisInstance() {
  return lenisInstance;
}
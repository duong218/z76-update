import { createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';

const ConfirmContext = createContext(null);

// Thay thế window.confirm() gốc trình duyệt (không style được, không đồng
// nhất với design-system) bằng modal riêng — dùng đúng bo góc 10px, shadow
// 1 mức, và màu đỏ/xanh chính theo đúng vai trò hành động (mục 4, 6 trong
// design-system.md).
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  // state: { message, title, confirmLabel, cancelLabel, danger, resolve }

  useScrollLock(Boolean(state));

  const confirmAction = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setState({
        message,
        title: options.title || 'Xác nhận hành động',
        confirmLabel: options.confirmLabel || 'Xác nhận',
        cancelLabel: options.cancelLabel || 'Huỷ',
        danger: options.danger !== false, // mặc định coi là hành động cần cảnh báo (ngừng dùng/xoá)
        resolve,
      });
    });
  }, []);

  const handleClose = (result) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirmAction }}>
      {children}

      {state && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div className="bg-white w-full max-w-sm rounded-[10px] shadow-z176 overflow-hidden border border-slate-200">
            <div className="p-5 flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: state.danger ? '#FEECEC' : '#FFFBEB',
                  color: state.danger ? '#C53030' : '#B45309',
                }}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 id="confirm-dialog-title" className="font-bold text-base text-[#0F172A]">
                  {state.title}
                </h3>
                <p className="text-sm text-[#334155] mt-1.5 leading-relaxed">{state.message}</p>
              </div>
              <button
                onClick={() => handleClose(false)}
                className="shrink-0 p-1 -m-1 text-slate-400 hover:text-slate-600 rounded-lg min-touch-target flex items-center justify-center"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 pb-5 flex gap-3">
              <button
                type="button"
                onClick={() => handleClose(false)}
                className="flex-1 min-h-[44px] py-2.5 border border-slate-300 rounded-[10px] font-medium text-[#0F172A] hover:bg-slate-50 transition-colors"
              >
                {state.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => handleClose(true)}
                autoFocus
                className="flex-1 min-h-[44px] py-2.5 rounded-[10px] font-semibold text-white transition-colors"
                style={{ backgroundColor: state.danger ? '#E53E3E' : '#008BC5' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = state.danger ? '#C53030' : '#0693E3')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = state.danger ? '#E53E3E' : '#008BC5')}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

// Dùng: const confirmAction = useConfirm(); if (!(await confirmAction('...'))) return;
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm phải được gọi bên trong <ConfirmProvider>');
  }
  return ctx.confirmAction;
}
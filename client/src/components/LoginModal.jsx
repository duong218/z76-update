import { useState, useRef, useEffect } from 'react';
import { X, User, Lock, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { loginUser } from '../services/auth.service';
import { useScrollLock } from '../hooks/useScrollLock';

// Đặt file logo tại: client/public/logo/logo.svg
const LOGO_SRC = '/logo/logo.svg';

// Đặt ảnh của bạn tại: client/public/images/login-cover.jpg
// (khuyến nghị ảnh dọc, chủ thể ở giữa khung, >= 1200x1600px).
// Mobile: ảnh nằm ngang phía trên form (dải ngắn, không chiếm quá nhiều màn hình).
// Desktop: ảnh nằm bên trái, chiếm gần một nửa modal để nhìn rõ hơn.
const LOGIN_IMAGE_SRC = '/images/login-cover.jpg';

export const LoginModal = ({ isOpen, onClose, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const usernameRef = useRef(null);
  const errorRef = useRef(null);

  useScrollLock(isOpen);

  // Tự động focus vào ô tên đăng nhập khi mở modal, reset trạng thái ẩn/hiện mật khẩu
  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      setShowPassword(false);
      setCapsLockOn(false);
      const t = setTimeout(() => usernameRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Đưa focus tới banner lỗi khi có lỗi mới — hỗ trợ screen reader / bàn phím
  useEffect(() => {
    if (errorMessage) errorRef.current?.focus();
  }, [errorMessage]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !isLoading) onClose();
  };

  // Cảnh báo Caps Lock — hữu ích cho người dùng lớn tuổi hay gõ nhầm mật khẩu
  const handlePasswordKey = (e) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!username.trim()) {
      setErrorMessage('Vui lòng nhập tên đăng nhập');
      return;
    }
    if (!password) {
      setErrorMessage('Vui lòng nhập mật khẩu');
      return;
    }

    setErrorMessage('');
    setIsLoading(true);

    try {
      const data = await loginUser(username.trim(), password);
      onLoginSuccess(data.user);
      onClose();
      // Reset form
      setUsername('');
      setPassword('');
    } catch (err) {
      setErrorMessage(err.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
      onMouseDown={handleBackdropClick}
      role="presentation"
    >
      <div
        className="flex w-full max-w-md sm:max-w-[860px] max-h-[92vh] sm:max-h-[85vh] flex-col overflow-hidden rounded-[12px] border border-slate-200 bg-white shadow-z176 sm:flex-row animate-fade-in-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
      >
        {/* Nhãn ẩn cho screen reader — dùng chung cho cả header nổi (mobile) và header chuẩn (desktop) bên dưới, tránh trùng id */}
        <span id="login-modal-title" className="sr-only">
          Đăng nhập hệ thống Z176
        </span>

        {/* Cột trái: ảnh minh họa — thuần túy trực quan.
            Mobile: dải ngang gọn phía trên, thanh tiêu đề + nút đóng NỔI ngay trên ảnh (không tách thành thanh riêng bên dưới).
            Desktop: chiếm gần nửa modal (45%) để nhìn rõ, chi tiết hơn; thanh tiêu đề nằm ở cột form bên phải như bình thường. */}
        {!imageError && (
          <div className="relative h-40 w-full shrink-0 overflow-hidden bg-slate-100 sm:h-auto sm:w-[45%]">
            <img
              src={LOGIN_IMAGE_SRC}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setImageError(true)}
            />
            {/* Thanh tiêu đề nổi trên ảnh — chỉ hiện ở mobile */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 via-black/25 to-transparent p-3 sm:hidden">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white p-1 shadow-z176">
                  <img src={LOGO_SRC} alt="" aria-hidden="true" className="h-full w-full object-contain" />
                </div>
                <span
                  className="text-sm font-bold text-white"
                  style={{
                    textShadow:
                      '-1px -1px 0 rgba(0,0,0,0.85), 1px -1px 0 rgba(0,0,0,0.85), -1px 1px 0 rgba(0,0,0,0.85), 1px 1px 0 rgba(0,0,0,0.85), 0 2px 4px rgba(0,0,0,0.6)',
                  }}
                >
                  Đăng nhập hệ thống Z176
                </span>
              </div>
              <button
                onClick={onClose}
                className="min-touch-target flex items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Đóng bảng đăng nhập"
                disabled={isLoading}
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>
        )}

        {/* Cột phải: form đăng nhập */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Header chuẩn — luôn hiện trên desktop; trên mobile chỉ hiện khi ảnh lỗi/không có (để nút đóng luôn có chỗ) */}
          <div
            className={`items-center justify-between gap-2 bg-[#0F172A] p-4 sm:p-5 text-white shrink-0 ${
              imageError ? 'flex' : 'hidden sm:flex'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-white p-1 sm:p-1.5">
                <img src={LOGO_SRC} alt="" aria-hidden="true" className="h-full w-full object-contain" />
              </div>
              <h3 className="text-base sm:text-xl font-bold text-white">
                Đăng nhập hệ thống Z176
              </h3>
            </div>
            <button
              onClick={onClose}
              className="min-touch-target flex items-center justify-center rounded-lg p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008BC5]"
              aria-label="Đóng bảng đăng nhập"
              disabled={isLoading}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Form body — cuộn riêng nếu màn hình thấp */}
          <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto space-y-4 sm:space-y-6 p-4 sm:p-8">
            {errorMessage && (
              <div
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-[#E53E3E]/30 bg-[#FEECEC] p-3 sm:p-4 text-sm sm:text-base font-medium text-[#0F172A] outline-none"
              >
                <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 text-[#E53E3E]" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div>
              <label htmlFor="login-username" className="mb-2 block text-sm sm:text-base font-semibold text-[#334155]">
                Tên đăng nhập <span className="text-[#E53E3E]">*</span>
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 sm:left-4 top-1/2 h-5 w-5 sm:h-6 sm:w-6 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-username"
                  ref={usernameRef}
                  type="text"
                  placeholder="Nhập tên đăng nhập"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="min-h-[48px] sm:min-h-[56px] w-full rounded-lg border border-slate-300 bg-slate-50 pl-10 sm:pl-14 pr-3 text-base sm:text-lg text-[#0F172A] transition-colors focus:border-[#008BC5] focus:outline-none focus:ring-2 focus:ring-[#008BC5]/30"
                  required
                  disabled={isLoading}
                  autoComplete="username"
                  aria-invalid={Boolean(errorMessage)}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label htmlFor="login-password" className="block text-sm sm:text-base font-semibold text-[#334155]">
                  Mật khẩu <span className="text-[#E53E3E]">*</span>
                </label>
                {capsLockOn && (
                  <span className="text-xs sm:text-sm font-semibold text-[#B45309]" role="status">
                    Caps Lock đang bật
                  </span>
                )}
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 sm:left-4 top-1/2 h-5 w-5 sm:h-6 sm:w-6 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={handlePasswordKey}
                  onKeyDown={handlePasswordKey}
                  className="min-h-[48px] sm:min-h-[56px] w-full rounded-lg border border-slate-300 bg-slate-50 pl-10 sm:pl-14 pr-12 sm:pr-14 text-base sm:text-lg text-[#0F172A] transition-colors focus:border-[#008BC5] focus:outline-none focus:ring-2 focus:ring-[#008BC5]/30"
                  required
                  disabled={isLoading}
                  autoComplete="current-password"
                  aria-invalid={Boolean(errorMessage)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={isLoading}
                  className="min-touch-target sm:h-14 sm:w-14 absolute right-0 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-[#0F172A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008BC5] disabled:opacity-50"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Eye className="h-5 w-5 sm:h-6 sm:w-6" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex min-h-[48px] sm:min-h-[56px] w-full items-center justify-center gap-2 rounded-[10px] bg-[#008BC5] text-base sm:text-lg font-bold text-white transition-colors hover:bg-[#0693E3] active:bg-[#006BA1] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#008BC5]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
                  <span>Đang xác thực...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
                  <span>ĐĂNG NHẬP</span>
                </>
              )}
            </button>

            <p className="flex items-center justify-center gap-1.5 pt-1 text-xs sm:text-sm text-[#64748B]">
              <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Kết nối được mã hóa và bảo mật
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};
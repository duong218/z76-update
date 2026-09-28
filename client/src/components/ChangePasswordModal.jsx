import { useState } from 'react';
import { X, KeyRound, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { changePassword } from '../services/auth.service';
import { useScrollLock } from '../hooks/useScrollLock';

export const ChangePasswordModal = ({ isOpen, onClose, onPasswordChanged, preventClose = false }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useScrollLock(isOpen);

  if (!isOpen) return null;

  const handleClose = () => {
    if (preventClose) return;
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Xác nhận mật khẩu mới không khớp.');
      return;
    }

    setLoading(true);
    try {
      // Gửi request đổi mật khẩu — server thu hồi toàn bộ token cũ (tăng
      // tokenVersion) và chủ động yêu cầu đăng nhập lại (xem message trả về
      // từ AUTH_PASSWORD_CHANGED). TRƯỚC ĐÂY modal tự động gọi loginUser()
      // ngay sau đó để lấy token mới, khiến CandidateDashboard KHÔNG bị
      // remount (chỉ đổi currentUser prop) — nếu đúng lúc đó có request cũ
      // (vd fetchMyExam) đang bay bằng token vừa bị thu hồi, nó dính lỗi và
      // set examStatus = null vĩnh viễn cho tới khi có trigger khác (bug: nút
      // "VÀO THI CHÍNH THỨC" bị disable + hiện nhầm "đã hoàn thành lượt thi"
      // dù thí sinh chưa hề thi). Fix: KHÔNG tự đăng nhập lại — bắt người
      // dùng đăng nhập lại thủ công, để có 1 phiên hoàn toàn mới/sạch, mọi
      // component (kể cả CandidateDashboard) mount lại từ đầu với token
      // chuẩn ngay từ request đầu tiên.
      await changePassword(currentPassword, newPassword);

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        onClose();
        onPasswordChanged(); // App.jsx: đăng xuất về trang chủ, yêu cầu đăng nhập lại
      }, 2000);
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra khi đổi mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2 font-bold text-lg text-[#0F172A]">
            <KeyRound className="w-5 h-5 text-[#008BC5]" />
            <span>Đổi mật khẩu tài khoản</span>
          </div>
          {!preventClose && (
            <button 
              onClick={handleClose} 
              disabled={loading}
              className="text-slate-400 hover:text-slate-600 disabled:opacity-30"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {success ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-16 h-16 bg-[#F0FDF4] text-[#22C55E] rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h4 className="text-xl font-bold text-slate-800">Đổi mật khẩu thành công!</h4>
            <p className="text-sm text-slate-500">Vui lòng đăng nhập lại bằng mật khẩu mới để tiếp tục.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && (
              <div className="p-3 bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] text-sm rounded-lg flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Mật khẩu hiện tại</label>
              <input
                type="password"
                required
                placeholder="Nhập mật khẩu đang dùng..."
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Mật khẩu mới (Tối thiểu 8 ký tự)</label>
              <input
                type="password"
                required
                placeholder="Nhập mật khẩu mới..."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Xác nhận mật khẩu mới</label>
              <input
                type="password"
                required
                placeholder="Xác nhận lại mật khẩu mới..."
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] text-base"
              />
            </div>

            <div className="pt-2 flex gap-3">
              {!preventClose && (
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="flex-1 py-2.5 border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Hủy
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 bg-[#008BC5] text-white rounded-lg font-semibold hover:bg-[#007ba1] transition-colors flex items-center justify-center gap-2 disabled:opacity-75"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Xác nhận đổi
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
import { useState, useEffect } from 'react';
import { Plus, Loader2, X, AlertCircle, Edit2, Trash2 } from 'lucide-react';
import { fetchTopics, createTopic, updateTopic, deleteTopic } from '../../services/examiner.service';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../ToastContext';
import { useScrollLock } from '../../hooks/useScrollLock';

export const TopicTab = ({ onViewQuestions } = {}) => {
  const confirmAction = useConfirm();
  const { showToast } = useToast();
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  // Modal State
  const [isOpen, setIsOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useScrollLock(isOpen); // MỚI — khoá cuộn trang nền khi modal thêm/sửa chủ đề đang mở

  const loadTopics = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchTopics();
      setTopics(data);
    } catch (err) {
      setError(err.message || 'Lỗi khi tải danh sách chủ đề');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTopics();
  }, []);

  const handleOpenAdd = () => {
    setEditingTopic(null);
    setName('');
    setDescription('');
    setIsOpen(true);
  };

  const handleOpenEdit = (topic) => {
    setEditingTopic(topic);
    setName(topic.name || '');
    setDescription(topic.description || '');
    setIsOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setActionLoading(true);
    setError('');
    try {
      if (editingTopic) {
        await updateTopic(editingTopic._id, { name, description });
        showToast('Cập nhật chủ đề thành công', 'success');
      } else {
        const result = await createTopic({ name, description });
        // result.restored = true khi tên trùng với 1 chủ đề đã bị xoá mềm
        // trước đó -> hệ thống khôi phục lại thay vì tạo mới, cần báo rõ để
        // người dùng không bất ngờ khi "chủ đề mới" lại có sẵn câu hỏi cũ.
        showToast(
          result?.message || (result?.restored ? 'Đã khôi phục chủ đề trước đó' : 'Tạo chủ đề thành công'),
          result?.restored ? 'warning' : 'success',
        );
      }
      setIsOpen(false);
      setEditingTopic(null);
      setName('');
      setDescription('');
      await loadTopics();
    } catch (err) {
      setError(err.message || (editingTopic ? 'Lỗi khi cập nhật chủ đề' : 'Lỗi khi tạo chủ đề'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (topic) => {
    const ok = await confirmAction(
      `Bạn có chắc chắn muốn ngừng sử dụng chủ đề "${topic.name}"? Các câu hỏi đang gắn với chủ đề này sẽ tự động bị ẩn khỏi ngân hàng câu hỏi (không xóa dữ liệu), và chủ đề sẽ không còn hiển thị để chọn nữa.`,
      { title: 'Ngừng sử dụng chủ đề', confirmLabel: 'Ngừng sử dụng' }
    );
    if (!ok) return;
    setActionLoading(true);
    setError('');
    try {
      await deleteTopic(topic._id);
      await loadTopics();
    } catch (err) {
      const message = err.message || 'Lỗi khi ngừng sử dụng chủ đề';
      setError(message);
      // Thêm toast lỗi song song với banner — lỗi bị CHẶN (vd đang có kỳ thi
      // published dùng chủ đề này) cần nổi bật ngay, tránh người dùng chỉ
      // thấy nút hết loading rồi tưởng đã ngừng sử dụng thành công mà không
      // để ý banner phía trên đầu trang.
      showToast(message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-6">
          <div className="h-10 w-48 bg-slate-200 rounded-lg animate-pulse"></div>
          <div className="h-10 w-32 bg-slate-200 rounded-lg animate-pulse"></div>
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-pulse space-y-3">
            <div className="h-6 w-1/3 bg-slate-200 rounded"></div>
            <div className="h-4 w-2/3 bg-slate-200 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-[#FEECEC] border border-[#E53E3E]/30 text-[#0F172A] rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* MỚI — animate-fade-in-up: đồng bộ hiệu ứng xuất hiện khi tab vừa tải
          xong, cùng pattern với AccountTab.jsx / AuditLogTab.jsx bên Admin. */}
      <div className="animate-fade-in-up flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3" style={{ '--stagger-delay': '0ms' }}>
        <h3 className="text-base sm:text-lg font-bold text-[#0F172A]">Danh sách chủ đề</h3>
        <button
          onClick={handleOpenAdd}
          className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-[#008BC5] text-white rounded-lg font-medium hover:bg-[#007ba1] active:bg-[#007ba1] transition-colors w-full sm:w-auto"
        >
          <Plus className="w-5 h-5" />
          <span>Thêm chủ đề</span>
        </button>
      </div>

      <div className="animate-fade-in-up grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4" style={{ '--stagger-delay': '80ms' }}>
        {topics.map(topic => (
          <div key={topic._id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <h4 className="font-bold text-slate-800 text-base mb-2">{topic.name}</h4>
              <p className="text-sm text-slate-500 line-clamp-3">{topic.description || 'Không có mô tả'}</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span>Trạng thái: {topic.isActive ? 'Hoạt động' : 'Tạm khóa'}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(topic)}
                    className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-[#008BC5] hover:bg-blue-50 active:bg-blue-100 rounded-lg transition-colors"
                    title="Sửa chủ đề"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(topic)}
                    className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors"
                    title="Ngừng sử dụng chủ đề"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {onViewQuestions && (
                <button
                  type="button"
                  onClick={() => onViewQuestions(topic._id)}
                  className="w-full text-right text-xs font-semibold text-[#008BC5] hover:underline py-1.5 min-h-[32px]"
                >
                  Xem câu hỏi →
                </button>
              )}
            </div>
          </div>
        ))}

        {topics.length === 0 && (
          <div className="col-span-full bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
            Chưa có chủ đề nào được tạo.
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90dvh] overflow-hidden border border-slate-100 flex flex-col my-auto" data-lenis-prevent>
            <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-lg text-[#0F172A]">{editingTopic ? 'Sửa chủ đề' : 'Thêm chủ đề mới'}</h3>
              <button
                onClick={() => { setIsOpen(false); setEditingTopic(null); }}
                className="text-slate-400 hover:text-slate-600 p-2 -mr-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Tên chủ đề</label>
                <input
                  type="text"
                  required
                  placeholder="Nhập tên chủ đề..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Mô tả</label>
                <textarea
                  placeholder="Nhập mô tả..."
                  rows="3"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5]"
                />
              </div>
              <div className="pt-2 flex gap-3 pb-1">
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); setEditingTopic(null); }}
                  className="flex-1 py-3 min-h-[46px] border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-3 min-h-[46px] bg-[#008BC5] text-white rounded-lg font-semibold hover:bg-[#007ba1] active:bg-[#007ba1] transition-colors flex items-center justify-center gap-2 disabled:opacity-75"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingTopic ? 'Cập nhật' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
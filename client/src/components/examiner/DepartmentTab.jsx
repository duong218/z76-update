import { useState, useEffect } from 'react';
import { Plus, Loader2, X, AlertCircle, Edit2, Trash2, Search, BookOpen } from 'lucide-react';
import { fetchDepartments, createDepartment, updateDepartment, deleteDepartment } from '../../services/examiner.service';
import { useConfirm } from '../ConfirmDialog';
import { useScrollLock } from '../../hooks/useScrollLock';

export const DepartmentTab = ({ onViewQuestions } = {}) => {
  const confirmAction = useConfirm();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  // MỚI — Ô tìm kiếm theo tên/mã bộ phận. Khi có 10-20 bộ phận trở lên, cuộn
  // tay để tìm rất mất công — lọc client-side ngay vì đây chỉ là danh sách
  // đã tải hết 1 lần (không phân trang phía server).
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isOpen, setIsOpen] = useState(false);

  useScrollLock(isOpen);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');

  const loadDepartments = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchDepartments();
      setDepartments(data);
    } catch (err) {
      setError(err.message || 'Lỗi khi tải danh sách phòng ban');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, []);

  const handleOpenAdd = () => {
    setEditingDepartment(null);
    setName('');
    setCode('');
    setDescription('');
    setIsOpen(true);
  };

  const handleOpenEdit = (dept) => {
    setEditingDepartment(dept);
    setName(dept.name || '');
    setCode(dept.code || '');
    setDescription(dept.description || '');
    setIsOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    setActionLoading(true);
    setError('');
    try {
      if (editingDepartment) {
        await updateDepartment(editingDepartment._id, { name, code: code.toUpperCase(), description });
      } else {
        await createDepartment({ name, code: code.toUpperCase(), description });
      }
      setIsOpen(false);
      setEditingDepartment(null);
      setName('');
      setCode('');
      setDescription('');
      await loadDepartments();
    } catch (err) {
      setError(err.message || (editingDepartment ? 'Lỗi khi cập nhật bộ phận' : 'Lỗi khi tạo phòng ban'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (dept) => {
    const ok = await confirmAction(
      `Bạn có chắc chắn muốn ngừng sử dụng bộ phận "${dept.name}"? Các câu hỏi/nhân viên đang gắn với bộ phận này sẽ không bị xóa, nhưng bộ phận sẽ không còn hiển thị để chọn nữa.`,
      { title: 'Ngừng sử dụng bộ phận', confirmLabel: 'Ngừng sử dụng' }
    );
    if (!ok) return;
    setActionLoading(true);
    setError('');
    try {
      await deleteDepartment(dept._id);
      await loadDepartments();
    } catch (err) {
      setError(err.message || 'Lỗi khi ngừng sử dụng bộ phận');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredDepartments = departments.filter((dept) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      dept.name?.toLowerCase().includes(term) ||
      dept.code?.toLowerCase().includes(term)
    );
  });

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
        <h3 className="text-base sm:text-lg font-bold text-[#0F172A]">Danh sách bộ phận / phòng ban</h3>
        <button
          onClick={handleOpenAdd}
          className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-[#008BC5] text-white rounded-lg font-medium hover:bg-[#007ba1] active:bg-[#007ba1] transition-colors w-full sm:w-auto"
        >
          <Plus className="w-5 h-5" />
          <span>Thêm bộ phận</span>
        </button>
      </div>

      {/* MỚI — Tìm kiếm theo tên/mã, chỉ hiện khi danh sách đủ dài để cần lọc
          (từ 6 bộ phận trở lên); với danh sách ngắn ô này chỉ chiếm chỗ vô ích. */}
      {departments.length >= 6 && (
        <div className="animate-fade-in-up relative" style={{ '--stagger-delay': '80ms' }}>
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên hoặc mã bộ phận..."
            className="w-full pl-10 pr-3.5 py-2.5 min-h-[44px] text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5]"
          />
        </div>
      )}

      {/* MỚI — Mobile: danh sách dạng dòng compact (1 dòng/bộ phận, không mô
          tả, không padding lớn) để 10-20 bộ phận không kéo dài quá mức khi
          cuộn. Desktop/tablet (sm+): vẫn giữ dạng lưới card đầy đủ như cũ vì
          không gian ngang rộng, không bị áp lực chiều cao. */}
      <div className="animate-fade-in-up sm:hidden bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden" style={{ '--stagger-delay': '140ms' }}>
        {filteredDepartments.map((dept) => (
          <div key={dept._id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800 text-sm truncate">{dept.name}</span>
                <span className="px-1.5 py-0.5 bg-blue-100 text-[#008BC5] rounded text-[11px] font-semibold uppercase shrink-0">
                  {dept.code}
                </span>
                {!dept.isActive && (
                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[11px] font-medium shrink-0">
                    Tạm khóa
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onViewQuestions && (
                <button
                  type="button"
                  onClick={() => onViewQuestions(dept._id)}
                  className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-[#008BC5] active:bg-blue-100 rounded-lg transition-colors"
                  title="Xem câu hỏi riêng của bộ phận này"
                >
                  <BookOpen className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => handleOpenEdit(dept)}
                className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-[#008BC5] active:bg-blue-100 rounded-lg transition-colors"
                title="Sửa bộ phận"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(dept)}
                className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-red-500 active:bg-red-100 rounded-lg transition-colors"
                title="Ngừng sử dụng bộ phận"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {filteredDepartments.length === 0 && (
          <div className="p-10 text-center text-slate-500 text-sm">
            {departments.length === 0 ? 'Chưa có bộ phận nào được tạo.' : 'Không tìm thấy bộ phận phù hợp.'}
          </div>
        )}
      </div>

      <div className="animate-fade-in-up hidden sm:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4" style={{ '--stagger-delay': '140ms' }}>
        {filteredDepartments.map(dept => (
          <div key={dept._id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <div className="flex justify-between items-start gap-2 mb-2">
                <h4 className="font-bold text-slate-800 text-base">{dept.name}</h4>
                <span className="px-2 py-0.5 bg-blue-100 text-[#008BC5] rounded text-xs font-semibold uppercase">{dept.code}</span>
              </div>
              <p className="text-sm text-slate-500 line-clamp-3">{dept.description || 'Không có mô tả'}</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span>Trạng thái: {dept.isActive ? 'Hoạt động' : 'Tạm khóa'}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(dept)}
                    className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-[#008BC5] hover:bg-blue-50 active:bg-blue-100 rounded-lg transition-colors"
                    title="Sửa bộ phận"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(dept)}
                    className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors"
                    title="Ngừng sử dụng bộ phận"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {onViewQuestions && (
                <button
                  type="button"
                  onClick={() => onViewQuestions(dept._id)}
                  className="w-full text-right text-xs font-semibold text-[#008BC5] hover:underline py-1.5 min-h-[32px]"
                >
                  Xem câu hỏi riêng bộ phận →
                </button>
              )}
            </div>
          </div>
        ))}

        {filteredDepartments.length === 0 && (
          <div className="col-span-full bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
            {departments.length === 0 ? 'Chưa có bộ phận nào được tạo.' : 'Không tìm thấy bộ phận phù hợp.'}
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90dvh] overflow-hidden border border-slate-100 flex flex-col my-auto" data-lenis-prevent>
            <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-lg text-[#0F172A]">{editingDepartment ? 'Sửa bộ phận' : 'Thêm bộ phận mới'}</h3>
              <button
                onClick={() => { setIsOpen(false); setEditingDepartment(null); }}
                className="text-slate-400 hover:text-slate-600 p-2 -mr-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Mã bộ phận (Ví dụ: XDM1)</label>
                <input
                  type="text"
                  required
                  placeholder="Nhập mã viết tắt..."
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008BC5] uppercase"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Tên bộ phận</label>
                <input
                  type="text"
                  required
                  placeholder="Nhập tên bộ phận..."
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
                  onClick={() => { setIsOpen(false); setEditingDepartment(null); }}
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
                  {editingDepartment ? 'Cập nhật' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
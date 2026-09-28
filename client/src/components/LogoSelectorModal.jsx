import { useState, useRef } from 'react';
import { X, Upload, Check, RefreshCw, Sparkles } from 'lucide-react';
import { PRESET_LOGOS, UnitLogoDisplay } from './UnitLogoDisplay';
import { useScrollLock } from '../hooks/useScrollLock';

export const LogoSelectorModal = ({
  isOpen,
  onClose,
  currentLogo,
  onSaveLogo,
}) => {
  const [selectedLogo, setSelectedLogo] = useState(currentLogo);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  useScrollLock(isOpen);

  if (!isOpen) return null;

  // Handle local image file upload & resize to lightweight Base64 data URL
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Vui lòng chọn tập tin ảnh định dạng PNG, JPG hoặc WEBP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Kích thước ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 5MB.');
      return;
    }

    setErrorMsg('');
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        // Optimize and compress image using offscreen Canvas for fast loading speed
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 250;
        const MAX_HEIGHT = 250;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/png', 0.85);
          setSelectedLogo({
            type: 'custom',
            customUrl: compressedDataUrl,
            title: file.name.split('.')[0] || 'Logo tải lên',
          });
        }
        setIsProcessing(false);
      };
      img.onerror = () => {
        setErrorMsg('Không thể đọc tập tin ảnh này.');
        setIsProcessing(false);
      };
      img.src = event.target?.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onSaveLogo(selectedLogo);
    onClose();
  };

  const handleResetDefault = () => {
    const defaultLogo = {
      type: 'preset',
      presetId: 'defense_star',
      title: 'Huy hiệu Quốc phòng Z176',
    };
    setSelectedLogo(defaultLogo);
    onSaveLogo(defaultLogo);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-lg rounded-[10px] shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-[#0F172A] text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#008BC5] text-white flex items-center justify-center font-bold shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white leading-tight">
                Tự động Cấu hình Logo Đơn vị Z176
              </h3>
              <p className="text-xs text-[#64748B]">Tải logo riêng hoặc chọn biểu trưng quân đội / dệt may</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white rounded-lg min-touch-target flex items-center justify-center"
            aria-label="Đóng bảng đổi logo"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1" data-lenis-prevent>
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-[#E53E3E] font-medium text-sm">
              {errorMsg}
            </div>
          )}

          {/* Current Selection Live Preview */}
          <div className="bg-slate-50 border border-slate-200 rounded-[10px] p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <UnitLogoDisplay config={selectedLogo} sizeClassName="w-12 h-12" iconSizeClassName="w-7 h-7" />
              <div>
                <span className="text-xs font-semibold text-[#008BC5] uppercase block">Xem trước Logo đang chọn</span>
                <span className="font-bold text-base text-[#0F172A]">
                  {selectedLogo.title || 'Logo tùy chỉnh'}
                </span>
              </div>
            </div>
            <button
              onClick={handleResetDefault}
              className="text-xs font-semibold text-slate-500 hover:text-[#008BC5] flex items-center gap-1 min-touch-target"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Mặc định
            </button>
          </div>

          {/* Option 1: File Upload */}
          <div className="space-y-2">
            <label className="block font-bold text-sm text-[#0F172A]">
              Cách 1: Tải file Logo đơn vị từ máy tính/điện thoại
            </label>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/png, image/jpeg, image/webp"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="w-full min-h-[48px] border-2 border-dashed border-[#008BC5]/50 bg-[#EAF6FF]/50 hover:bg-[#EAF6FF] rounded-[10px] p-3 text-center transition-colors flex items-center justify-center gap-2 cursor-pointer min-touch-target"
            >
              <Upload className="w-5 h-5 text-[#008BC5]" />
              <span className="font-bold text-sm text-[#008BC5]">
                {isProcessing ? 'Đang xử lý tối ưu ảnh...' : 'Bấm chọn file ảnh logo (PNG/JPG/WEBP)'}
              </span>
            </button>
            <p className="text-xs text-[#64748B]">
              * Hệ thống tự động nén & chuẩn hóa ảnh để không làm chậm tốc độ tải trang.
            </p>
          </div>

          {/* Option 2: Choose Presets */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <label className="block font-bold text-sm text-[#0F172A]">
              Cách 2: Chọn Biểu trưng Minh họa theo Chủ đề Z176
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PRESET_LOGOS.map((preset) => {
                const isSelected =
                  selectedLogo.type === 'preset' && selectedLogo.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      setSelectedLogo({
                        type: 'preset',
                        presetId: preset.id,
                        title: preset.title,
                      })
                    }
                    className={`p-3 rounded-lg border text-left flex items-center gap-3 transition-all min-touch-target ${
                      isSelected
                        ? 'border-[#008BC5] bg-[#EAF6FF] ring-2 ring-[#008BC5]/30'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <UnitLogoDisplay
                      config={{ type: 'preset', presetId: preset.id }}
                      sizeClassName="w-10 h-10"
                      iconSizeClassName="w-6 h-6"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-[#0F172A] truncate">{preset.title}</div>
                      <div className="text-xs text-[#64748B] truncate">{preset.description}</div>
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-[#008BC5] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-semibold text-[#334155] hover:bg-slate-100 min-touch-target"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 bg-[#008BC5] hover:bg-[#007ba1] text-white rounded-lg text-sm font-bold transition-colors min-touch-target flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>LƯU LOGO ĐƠN VỊ</span>
          </button>
        </div>
      </div>
    </div>
  );
};
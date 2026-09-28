import { Scissors, Factory, Award, Shield } from 'lucide-react';

export const PRESET_LOGOS = [
  {
    id: 'defense_star',
    title: 'Huy hiệu Quốc phòng Z176',
    description: 'Bảo vệ & Quốc phòng',
    iconName: 'ShieldCheck',
    bgClass: 'bg-[#008BC5] text-white',
  },
  {
    id: 'textile_loom',
    title: 'Ngành Dệt may Quân đội',
    description: 'Sản xuất dệt & bao bì KH',
    iconName: 'Scissors',
    bgClass: 'bg-emerald-600 text-white',
  },
  {
    id: 'safety_shield',
    title: 'Biểu trưng An toàn Lao động',
    description: 'An toàn & BHLĐ Z176',
    iconName: 'Shield',
    bgClass: 'bg-blue-700 text-white',
  },
  {
    id: 'military_crest',
    title: 'Huy chương Thi đua Khen thưởng',
    description: 'Thi đua thắng lợi',
    iconName: 'Award',
    bgClass: 'bg-amber-600 text-white',
  },
  {
    id: 'factory_gear',
    title: 'Nhà máy Sản xuất Quốc phòng',
    description: 'Cơ điện & Kỹ thuật Z176',
    iconName: 'Factory',
    bgClass: 'bg-slate-700 text-white',
  },
];

export const UnitLogoDisplay = ({
  config,
  sizeClassName = 'w-10 h-10',
  iconSizeClassName = 'w-6 h-6',
}) => {
  if (!config) return null;

  if (config?.type === 'custom' && config?.customUrl) {
    return (
      <div className={`${sizeClassName} rounded-lg overflow-hidden border border-slate-300 shadow-z176 bg-white flex items-center justify-center shrink-0`}>
        <img
          src={config.customUrl}
          alt={config.title || 'Logo đơn vị Z176'}
          className="w-full h-full object-contain p-0.5"
        />
      </div>
    );
  }

  const presetId = config.presetId || 'defense_star';

  switch (presetId) {
    case 'textile_loom':
      return (
        <div className={`${sizeClassName} rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-z176 shrink-0`}>
          <Scissors className={iconSizeClassName} />
        </div>
      );
    case 'safety_shield':
      return (
        <div className={`${sizeClassName} rounded-lg bg-blue-700 text-white flex items-center justify-center shadow-z176 shrink-0`}>
          <Shield className={iconSizeClassName} />
        </div>
      );
    case 'military_crest':
      return (
        <div className={`${sizeClassName} rounded-lg bg-amber-600 text-white flex items-center justify-center shadow-z176 shrink-0`}>
          <Award className={iconSizeClassName} />
        </div>
      );
    case 'factory_gear':
      return (
        <div className={`${sizeClassName} rounded-lg bg-slate-700 text-white flex items-center justify-center shadow-z176 shrink-0`}>
          <Factory className={iconSizeClassName} />
        </div>
      );
    case 'defense_star':
    default:
      return (
        <div className={`${sizeClassName} rounded-lg overflow-hidden border border-slate-300 shadow-z176 bg-white flex items-center justify-center shrink-0`}>
          <img
            src="/logo/logo.svg"
            alt={config.title || 'Huy hiệu Quốc phòng Z176'}
            className="w-full h-full object-contain p-0.5"
          />
        </div>
      );
  }
};

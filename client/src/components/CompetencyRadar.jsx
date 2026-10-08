import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

// Chỉ vẽ radar (dùng cho desktop). Danh sách thanh đã có ở CompetencyBars.
// topics: [{ name, total, rate (0..1 | null), insufficientData }]
// Radar chỉ đẹp khi có từ 3 chủ đề; ít hơn thì không vẽ.
const short = (s) => (s.length > 20 ? `${s.slice(0, 19)}…` : s); // nhãn dài bị cắt ở mép, tooltip vẫn hiện tên đầy đủ

export const CompetencyRadar = ({ topics = [] }) => {
  const data = topics
    .filter((t) => !t.insufficientData && t.rate !== null)
    .map((t) => ({ name: t.name, value: Math.round(t.rate * 100) }));
  if (data.length < 3) return null;

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="62%">
          <PolarGrid stroke="#E2E8F0" />
          <PolarAngleAxis dataKey="name" tickFormatter={short} tick={{ fontSize: 13, fill: '#334155' }} />
          <PolarRadiusAxis domain={[0, 100]} angle={90} tick={{ fontSize: 11, fill: '#64748B' }} />
          <Radar dataKey="value" stroke="#008BC5" fill="#008BC5" fillOpacity={0.3} />
          <Tooltip formatter={(value) => [`${value}%`, 'Tỷ lệ đúng']} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};
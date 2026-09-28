export const Z176_COMPANY_INFO = {
  name: 'CÔNG TY TNHH MTV 76 - BỘ QUỐC PHÒNG',
  shortName: 'Z176',
  badge: 'DOANH NGHIỆP BỘ QUỐC PHÒNG',
  contestTitle: 'HỆ THỐNG THI TRẮC NGHIỆM CHUYÊN MÔN DÀNH CHO CÁN BỘ, CÔNG NHÂN VIÊN',
  contestEdition: 'Lần thứ V, năm 2026',
  startDate: '01/09/2026',
  endDate: '15/09/2026',
  supportHotline: '024.3883.2176',
  supportEmail: 'hotro.thi@z176.vn',
  // Thông tin công ty chính thức (theo z76.vn/lien-he.html) — khác với
  // supportHotline/supportEmail ở trên (đó là kênh hỗ trợ riêng cho hệ
  // thống thi nội bộ, không phải số liên hệ chung của công ty).
  officialAddress: 'Xã Kiêu Kỵ, Huyện Gia Lâm, TP. Hà Nội',
  foundedDate: '09/03/1971',
  officialPhone: '(024) 38276386',
  officialEmail: 'info@z76.vn',
  officialWebsite: 'z76.vn',
  departments: [
    'Xưởng Dệt may 1',
    'Xưởng Dệt may 2',
    'Xưởng Bao bì KH',
    'Xưởng Cơ điện - Bảo dưỡng',
    'Phòng Tổ chức - Lao động',
    'Phòng Kỹ thuật - KTS',
    'Phòng Kế hoạch - Vật tư',
    'Phòng An toàn - BHLĐ'
  ]
};

export const SAMPLE_QUESTIONS = [
  {
    id: 1,
    question: 'Theo quy định an toàn tại nhà xưởng Z176, người lao động phải mang trang bị bảo hộ lao động (BHLĐ) vào thời điểm nào?',
    options: [
      'Chỉ khi có đoàn kiểm tra đến xưởng',
      'Trong suốt thời gian làm việc tại vị trí sản xuất',
      'Chỉ khi vận hành máy móc nguy hiểm',
      'Khi cảm thấy không an toàn'
    ],
    correctOptionIndex: 1,
    explanation: 'Người lao động bắt buộc phải mang đủ trang bị BHLĐ trong suốt quá trình làm việc tại khu vực sản xuất.'
  },
  {
    id: 2,
    question: 'Khi phát hiện sự cố cháy nổ hoặc chập điện tại xưởng dệt/bao bì, hành động ĐẦU TIÊN công nhân cần thực hiện là gì?',
    options: [
      'Gom đồ cá nhân và chạy ra ngoài ngay',
      'Hô khoán, ngắt cầu dao điện khu vực và báo động PCCC',
      'Dùng nước dội thẳng vào cầu dao điện',
      'Tìm người quản lý xưởng để xin ý kiến'
    ],
    correctOptionIndex: 1,
    explanation: 'Hô khoán báo động và cắt điện khẩn cấp giúp ngăn ngừa cháy lan và hạn chế tai nạn điện.'
  },
  {
    id: 3,
    question: 'Thời gian làm bài thi chính thức của mỗi lượt thi trực tuyến là bao nhiêu phút?',
    options: [
      '10 phút',
      '15 phút',
      '20 phút',
      '30 phút'
    ],
    correctOptionIndex: 2,
    explanation: 'Bài thi gồm 20 câu hỏi làm trong thời gian tối đa 20 phút.'
  },
  {
    id: 4,
    question: 'Người lao động đạt yêu cầu cuộc thi khi trả lời đúng tối thiểu bao nhiêu câu hỏi?',
    options: [
      '10 / 20 câu',
      '12 / 20 câu',
      '15 / 20 câu',
      '18 / 20 câu'
    ],
    correctOptionIndex: 2,
    explanation: 'Thí sinh cần đạt từ 15/20 câu (75%) trở lên để tính là ĐẠT.'
  },
  {
    id: 5,
    question: 'Hành vi nào sau đây vi phạm nghiêm trọng Nội quy an toàn lao động Công ty Z176?',
    options: [
      'Báo cáo ngay cho tổ trưởng khi máy bị hỏng hóc',
      'Sử dụng điện thoại cá nhân trong lúc vận hành máy dệt/máy may',
      'Đi đúng luồng đi bộ dành cho công nhân trong xưởng',
      'Vệ sinh công nghiệp khu vực làm việc trước khi bàn giao ca'
    ],
    correctOptionIndex: 1,
    explanation: 'Sử dụng điện thoại khi vận hành máy gây mất tập trung, dễ dẫn đến tai nạn lao động nghiêm trọng.'
  }
];

export const SAMPLE_RESULTS = [
  {
    id: 'R001',
    employeeId: 'NV17601',
    fullName: 'Nguyễn Văn An',
    department: 'Xưởng Dệt may 1',
    score: 18,
    totalQuestions: 20,
    completedAt: '02/09/2026 08:30',
    passed: true
  },
  {
    id: 'R002',
    employeeId: 'NV17602',
    fullName: 'Trần Thị Bình',
    department: 'Xưởng Bao bì KH',
    score: 19,
    totalQuestions: 20,
    completedAt: '02/09/2026 09:15',
    passed: true
  },
  {
    id: 'R003',
    employeeId: 'NV17603',
    fullName: 'Lê Hoàng Cường',
    department: 'Xưởng Cơ điện - Bảo dưỡng',
    score: 14,
    totalQuestions: 20,
    completedAt: '02/09/2026 10:05',
    passed: false
  },
  {
    id: 'R004',
    employeeId: 'NV17604',
    fullName: 'Phạm Thị Duyên',
    department: 'Phòng Tổ chức - Lao động',
    score: 20,
    totalQuestions: 20,
    completedAt: '02/09/2026 10:40',
    passed: true
  },
  {
    id: 'R005',
    employeeId: 'NV17605',
    fullName: 'Đỗ Minh Tuấn',
    department: 'Xưởng Dệt may 2',
    score: 16,
    totalQuestions: 20,
    completedAt: '02/09/2026 11:20',
    passed: true
  }
];
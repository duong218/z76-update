import { useState, useEffect } from 'react';
import { Award, Search, CheckCircle2, XCircle, Loader2, ChevronDown, BarChart3 } from 'lucide-react';
import { fetchPublicResultsByDepartment, lookupPublicResult } from '../services/report.service';

const VISIBLE_DEPT_COUNT = 5;

export const ResultsLookupSection = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = chưa tìm, [] = tìm nhưng rỗng
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [departments, setDepartments] = useState([]);
  const [deptLoading, setDeptLoading] = useState(true);
  const [showAllDepts, setShowAllDepts] = useState(false);

  useEffect(() => {
    fetchPublicResultsByDepartment()
      .then(data => setDepartments(Array.isArray(data) ? data : []))
      .catch(() => setDepartments([]))
      .finally(() => setDeptLoading(false));
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    const term = searchTerm.trim();
    if (!term) return;

    setSearching(true);
    setSearchError('');
    try {
      const data = await lookupPublicResult(term);
      setSearchResults(Array.isArray(data) ? data : []);
    } catch (err) {
      setSearchError('Không thể tra cứu lúc này. Vui lòng thử lại.');
      setSearchResults(null);
    } finally {
      setSearching(false);
    }
  };

  const visibleDepartments = showAllDepts ? departments : departments.slice(0, VISIBLE_DEPT_COUNT);

  return (
    <section id="results" className="py-6 px-4 bg-white border-t border-slate-200">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Title */}
        <div className="flex items-center gap-2.5 pb-2 border-b border-slate-300">
          <div className="w-9 h-9 rounded-lg bg-[#008BC5] text-white flex items-center justify-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#0F172A]">Tra cứu kết quả thi</h2>
            <p className="text-sm text-[#334155]">Nhập mã nhân viên hoặc họ tên để tra cứu điểm cá nhân</p>
          </div>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="bg-slate-50 p-4 rounded-[10px] border border-slate-200 shadow-z176 space-y-3">
          <div>
            <label className="block text-sm font-semibold text-[#0F172A] mb-1">
              Tìm theo Mã NV-Mã nhân viên hoặc Họ tên:
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="NV-17601 hoặc Nguyễn Văn An"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full min-h-[48px] pl-10 pr-3 bg-white border border-slate-300 rounded-lg text-base text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#008BC5]"
                />
                <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
              </div>
              <button
                type="submit"
                disabled={searching || !searchTerm.trim()}
                className="min-h-[48px] px-5 bg-[#008BC5] hover:bg-sky-600 text-white font-semibold rounded-lg disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Tìm
              </button>
            </div>
          </div>
        </form>

        {/* Search Results */}
        {searchError && (
          <div className="bg-red-50 border border-red-200 rounded-[10px] p-4 text-sm text-red-700">
            {searchError}
          </div>
        )}

        {searchResults !== null && !searchError && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-[#334155] px-1">
              Kết quả tra cứu ({searchResults.length})
            </div>

            {searchResults.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-[10px] p-6 text-center text-[#334155]">
                Không tìm thấy kết quả phù hợp. Vui lòng kiểm tra lại Mã nhân viên hoặc họ tên.
              </div>
            ) : (
              <div className="space-y-2">
                {searchResults.map((item, idx) => (
                  <div
                    key={`${item.employeeCode || item.fullname}-${idx}`}
                    className="bg-white border border-slate-200 rounded-[10px] p-4 shadow-z176 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-[#0F172A]">{item.fullname}</span>
                        {item.employeeCode && (
                          <span className="bg-slate-100 text-[#334155] text-xs px-2 py-0.5 rounded font-mono font-bold">
                            {item.employeeCode}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-[#334155]">{item.departmentName}</div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <div className="text-left sm:text-right">
                        <span className="text-xs text-slate-500 block">Điểm bài thi</span>
                        <span className="text-lg font-bold text-[#0F172A]">
                          {item.score}/{item.totalQuestions} câu
                        </span>
                      </div>

                      <div>
                        {item.passed ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-[#22C55E] font-bold text-sm">
                            <CheckCircle2 className="w-4 h-4" /> ĐẠT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-[#E53E3E] font-bold text-sm">
                            <XCircle className="w-4 h-4" /> CHƯA ĐẠT
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tỷ lệ đạt theo phòng ban */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <BarChart3 className="w-4 h-4 text-[#008BC5]" />
            <span className="text-sm font-semibold text-[#334155]">Tỷ lệ đạt theo phòng ban</span>
          </div>

          {deptLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 bg-slate-100 rounded-[10px] animate-pulse" />
              ))}
            </div>
          ) : departments.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-[10px] p-6 text-center text-[#334155]">
              Chưa có dữ liệu kết quả thi.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {visibleDepartments.map((dept) => (
                  <div
                    key={dept.departmentName}
                    className="bg-white border border-slate-200 rounded-[10px] p-4 shadow-z176"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-[#0F172A]">{dept.departmentName}</span>
                      <span className="text-sm font-bold text-[#008BC5]">{dept.passRate}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#008BC5] rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, dept.passRate))}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{dept.totalSubmissions} lượt thi</div>
                  </div>
                ))}
              </div>

              {departments.length > VISIBLE_DEPT_COUNT && (
                <button
                  onClick={() => setShowAllDepts(v => !v)}
                  className="w-full flex items-center justify-center gap-1 py-2.5 text-sm font-semibold text-[#008BC5] hover:underline"
                >
                  {showAllDepts ? 'Thu gọn' : `Xem thêm (${departments.length - VISIBLE_DEPT_COUNT} phòng ban)`}
                  <ChevronDown className={`w-4 h-4 transition-transform ${showAllDepts ? 'rotate-180' : ''}`} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
};
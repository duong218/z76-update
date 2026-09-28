import React from 'react';
import { AlertCircle } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Lỗi ứng dụng:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-800">
          <div className="bg-white p-8 rounded-xl shadow-z176 border border-red-200 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Đã xảy ra lỗi không mong muốn</h1>
            <p className="text-slate-600 mb-6 text-sm">
              Có lỗi kỹ thuật xảy ra trong quá trình hiển thị giao diện. Vui lòng thử tải lại trang hoặc liên hệ quản trị viên.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-[#008BC5] hover:bg-[#007AB0] text-white font-medium rounded-lg transition-colors"
            >
              Tải lại trang
            </button>
            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <div className="mt-6 text-left bg-slate-100 p-4 rounded-lg overflow-auto max-h-48 text-xs text-red-500 font-mono" data-lenis-prevent>
                {this.state.error.toString()}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
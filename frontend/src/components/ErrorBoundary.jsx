import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-0">
          <div className="text-center p-8 max-w-md">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-vermillion-600" />
            <h2 className="text-lg font-semibold text-ink-900 mb-2">页面出错了</h2>
            <p className="text-sm text-ink-500 mb-4">
              {this.state.error?.message || '发生了未知错误'}
            </p>
            <button
              onClick={this.handleRetry}
              className="flex items-center gap-2 mx-auto px-4 py-2 bg-vermillion-600 hover:bg-vermillion-500 rounded-lg text-sm transition"
            >
              <RotateCcw className="w-4 h-4" />
              重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

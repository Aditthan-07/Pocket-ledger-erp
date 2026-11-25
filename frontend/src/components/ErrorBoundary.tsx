import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Pocket Ledger ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white border border-gray-200 rounded-xl p-8 max-w-xl mx-auto shadow-xs text-center space-y-4 my-8">
          <div className="inline-flex p-3 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-semibold text-gray-900">
              {this.props.fallbackTitle || 'Something went wrong displaying this view'}
            </h3>
            <p className="text-xs text-gray-500">
              An unexpected client error occurred. The ledger and database state remain completely safe.
            </p>
          </div>

          {this.state.error && (
            <div className="p-3 bg-gray-50 rounded-lg text-left text-[11px] font-mono text-gray-700 overflow-x-auto max-h-32 border border-gray-200">
              {this.state.error.message || String(this.state.error)}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shadow-xs transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry View</span>
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Companion ErrorBoundary Caught]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ('indexedDB' in window) {
        indexedDB.deleteDatabase('companion_offline_store');
        indexedDB.deleteDatabase('companion_visual_vault');
      }
    } catch {
      // ignore
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || 'Unknown runtime error occurred during mount.';
      const stack = this.state.error?.stack || this.state.errorInfo?.componentStack || '';

      return (
        <div className="min-h-screen w-full bg-[#060818] text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
          <div className="max-w-lg w-full bg-[#0a0f2b] border border-cyan-500/30 rounded-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col items-center text-center space-y-5">
            <div className="relative flex items-center justify-center w-14 h-14 rounded-full bg-cyan-950/60 border border-cyan-400/40">
              <span className="text-2xl animate-pulse">⚡</span>
              <div className="absolute inset-0 rounded-full blur-md bg-cyan-400/20" />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-wider text-white font-mono">
                NEURAL LINK RECOVERY
              </h1>
              <p className="text-xs sm:text-sm text-cyan-200/80">
                Companion encountered an interruption during interface mount. You can reconnect or reset the session cache below.
              </p>
            </div>

            <div className="w-full text-left bg-[#040612] border border-cyan-900/40 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-cyan-400/80">
                <span>DIAGNOSTIC NOTICE</span>
                <span className="text-slate-500">ID: RUNTIME_RECOVER</span>
              </div>
              <p className="text-xs font-mono text-rose-300 break-words">{errorMsg}</p>
              {stack && (
                <details className="mt-2 text-[10px] font-mono text-slate-400">
                  <summary className="cursor-pointer hover:text-cyan-300 select-none">
                    View Callstack Details
                  </summary>
                  <pre className="mt-2 p-2 bg-black/60 rounded overflow-x-auto max-h-40 whitespace-pre-wrap text-[10px] text-slate-400">
                    {stack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
              >
                Reconnect Link
              </button>
              <button
                type="button"
                onClick={this.handleResetCache}
                className="flex-1 py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                Reset Cache &amp; Re-enter
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

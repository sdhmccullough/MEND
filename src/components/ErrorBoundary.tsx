import { Component, type ErrorInfo, type ReactNode } from 'react';

// A render crash in a medical record should say so, not go blank. (One
// bad selector once took the whole Today tab to a white screen.)
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-(--radius-card) border border-line bg-surface p-6 text-center shadow-(--shadow-card)">
          <h1 className="text-base font-bold">Something broke</h1>
          <p className="mt-1 text-sm text-muted">
            Your data is safe — it lives on the server, not in this screen.
            Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 min-h-11 w-full rounded-(--radius-control) bg-accent-strong px-4 text-sm font-semibold text-white"
          >
            Reload Mend
          </button>
          <p className="mt-3 truncate text-[10px] text-muted" title={this.state.error.message}>
            {this.state.error.message}
          </p>
        </div>
      </main>
    );
  }
}

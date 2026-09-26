import { Component, type ReactNode } from "react";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main role="alert" className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="font-serif text-2xl">Something went wrong</h1>
          <p>Please reload the page to try again.</p>
          <button className="rounded border border-border px-4 py-2" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

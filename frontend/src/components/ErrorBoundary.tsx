import React, { Suspense } from "react";
import { useQueryErrorResetBoundary } from "react-query";
import { useLocation } from "react-router-dom";
import { captureException } from "../lib/sentry";
import { logger } from "../lib/logger";

type BoundaryProps = {
  /** Changing this resets the boundary (route-level boundaries pass the pathname). */
  resetKey?: string;
  /** Called when the boundary resets (e.g. to reset failed react-query queries). */
  onReset?: () => void;
  children: React.ReactNode;
};

type BoundaryState = { error: Error | null };

const isChunkLoadError = (error: Error | null) =>
  Boolean(error && (error.name === "ChunkLoadError" || /Loading (CSS )?chunk \d+ failed/i.test(error.message)));

/** Catches render errors below it and shows a friendly "Retry" panel. */
export class ErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn("Render error caught by ErrorBoundary", error);
    }
    captureException(error, { componentStack: info.componentStack });
  }

  componentDidUpdate(previous: BoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.props.onReset?.();
      this.setState({ error: null });
    }
  }

  private handleRetry = () => {
    // A failed lazy chunk usually means a new deploy: reload to fetch the new build.
    if (isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto my-10 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Something went wrong</h2>
        <p className="text-sm text-slate-600">
          This part of the page couldn't be displayed. You can try again or go to another page.
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          className="rounded-full bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }
}

/** ErrorBoundary that resets whenever the route changes. */
export const RouteErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  // Queries use useErrorBoundary; reset them so "Retry" refetches instead of re-throwing.
  const { reset } = useQueryErrorResetBoundary();
  return (
    <ErrorBoundary resetKey={location.pathname} onReset={reset}>
      {children}
    </ErrorBoundary>
  );
};

/** Error boundary + Suspense for a lazy route element. */
export const LazyRoute = ({
  fallback = null,
  children,
}: {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <RouteErrorBoundary>
    <Suspense fallback={fallback}>{children}</Suspense>
  </RouteErrorBoundary>
);

export default ErrorBoundary;

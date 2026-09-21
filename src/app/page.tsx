'use client';

import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { AUTH_SESSION_EXPIRED_EVENT } from '@/lib/api';
import LoginPage from '@/components/LoginPage';
import EAMApp from '@/components/EAMApp';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="h-12 w-12 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center animate-pulse shadow-lg">
          <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 20h20M5 20V8l7-5 7 5v12M9 20v-6h6v6" />
          </svg>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">iAssetsPro</h2>
          <p className="text-sm text-muted-foreground">Loading your workspace...</p>
        </div>
        <div className="flex gap-1 justify-center">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0ms]" />
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:150ms]" />
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// GLOBAL ERROR BOUNDARY — catches and logs all rendering errors.
// Special handling for React Error #185 (setState during render): this error
// is recoverable — retrying the render usually succeeds because it was a
// timing issue between concurrent rendering and external store updates.
// ============================================================================

// Error message pattern for React #185
const ERROR_185_PATTERN = /Cannot update a component (?:from within the render function|while rendering a different component)/;

interface GlobalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryKey: number; // Used to force a re-render on retry
}

class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  GlobalErrorBoundaryState
> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, retryKey: 0 };
  }

  static getDerivedStateFromError(error: Error): GlobalErrorBoundaryState {
    // For Error #185, don't immediately show error — allow retry
    if (ERROR_185_PATTERN.test(error.message)) {
      return { hasError: false, error, retryKey: 0 };
    }
    return { hasError: true, error, retryKey: 0 };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log full error details for production debugging
    console.error('=== EAM RENDER ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('=== END ERROR ===');

    // For Error #185, schedule a silent retry after a short delay
    // This handles the case where a Zustand store update fires during
    // React's concurrent rendering. The retry almost always succeeds.
    if (ERROR_185_PATTERN.test(error.message)) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.setState((prev) => ({
          hasError: false,
          error: null,
          retryKey: prev.retryKey + 1,
        }));
      }, 50);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  handleRetry = () => {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.setState({ hasError: false, error: null, retryKey: 0 });
    window.location.reload();
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const err = this.state.error;
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center space-y-6 p-8 max-w-lg">
            <div className="h-14 w-14 mx-auto rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
              <svg className="h-7 w-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">Something went wrong</h3>
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred while rendering the application.
              </p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-lg p-4 text-left">
              <p className="text-xs font-mono text-red-700 dark:text-red-400 break-all">{err.message}</p>
              {err.stack && (
                <details className="mt-2">
                  <summary className="text-xs text-red-600 dark:text-red-400 cursor-pointer font-medium">Stack trace (check browser console)</summary>
                  <pre className="mt-2 text-[10px] text-red-600/80 dark:text-red-400/60 overflow-auto max-h-48 whitespace-pre-wrap break-all">{err.stack}</pre>
                </details>
              )}
            </div>
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  // Restore session on mount — MUST run before the auth gate
  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Any protected API can discover that the bearer session is gone before
  // /api/auth/me runs again. Reconcile the Zustand auth state immediately so
  // the protected app shell unmounts instead of continuing to issue 401/403s.
  useEffect(() => {
    const handleSessionExpired = () => {
      void fetchMe();
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [fetchMe]);

  // Global error handler for unhandled promise rejections & runtime errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('=== UNHANDLED ERROR ===');
      console.error('Message:', event.message);
      console.error('File:', event.filename, 'Line:', event.lineno, 'Col:', event.colno);
      console.error('Stack:', event.error?.stack);
      console.error('=== END UNHANDLED ERROR ===');
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error('=== UNHANDLED PROMISE REJECTION ===');
      console.error('Reason:', event.reason);
      console.error('=== END REJECTION ===');
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  // Ensure we're mounted before rendering
  useEffect(() => {
    React.startTransition(() => setMounted(true));
  }, []);

  if (!mounted || isLoading) {
    return <LoadingScreen />;
  }

  // Not logged in and not loading → show the login page
  if (!isAuthenticated || !user) {
    return <LoginPage />;
  }

  // Logged in → render the app shell directly.
  // IMPORTANT: We do NOT use React.lazy/Suspense here because Zustand's
  // useSyncExternalStore forces synchronous re-renders on navigation,
  // which causes React Error #306 (suspended during synchronous input).
  // Code splitting is handled inside EAMApp via useEffect + dynamic imports.
  return (
    <GlobalErrorBoundary>
      <EAMApp />
    </GlobalErrorBoundary>
  );
}

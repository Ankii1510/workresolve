"use client";

/**
 * Root-level error boundary (Phase 7, section 19) — catches an error thrown
 * from the root layout itself (where `src/app/error.tsx` can't help, since
 * it renders inside that same layout). Must render its own <html>/<body>
 * since the real root layout may be the thing that failed. Kept
 * intentionally minimal and dependency-free for the same reason.
 */
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[WorkResolve] unhandled root error:", error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center font-sans">
        <h1 className="text-xl font-semibold text-slate-900">Something went wrong.</h1>
        <p className="mt-2 max-w-md text-sm text-slate-600">
          WorkResolve failed to load. This didn&rsquo;t affect any blockchain transaction.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={reset}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
          >
            Try Again
          </button>
          <a
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Go to Dashboard
          </a>
        </div>
      </body>
    </html>
  );
}

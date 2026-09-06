"use client";

/**
 * Route-level error boundary (Phase 7, section 19 "Global Error Boundary").
 * Next.js renders this in place of the failing segment for any error thrown
 * during rendering — including one thrown by a page's own render path, not
 * just a caught contract/RPC error (those are already funneled through
 * `toAppError`/`ErrorNotice` at the point they occur; this is the backstop
 * for everything else: a genuine bug, an unexpected null, a library
 * throwing). Never shows a raw stack trace to the user — `error.message` is
 * logged to the console for developers, never rendered.
 */
import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Development-only console detail — see src/lib/utils/errors.ts's
    // logDevError for the same "never render raw errors" discipline.
    if (process.env.NODE_ENV !== "production") {
      console.error("[WorkResolve] unhandled render error:", error);
    }
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center sm:px-6">
      <h1 className="text-xl font-semibold text-slate-900">Something went wrong.</h1>
      <p className="mt-2 text-sm text-slate-600">
        WorkResolve hit an unexpected error rendering this page. This didn&rsquo;t affect any blockchain
        transaction — nothing was signed or sent as a result of this.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try Again</Button>
        <Link href="/dashboard">
          <Button variant="outline">Go to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}

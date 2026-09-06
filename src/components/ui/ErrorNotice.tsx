import { Button } from "./Button";
import type { AppError } from "@/types";

/** Renders any AppError as a calm, understandable notice — never a raw
 * stack trace (docs/architecture.md section 14 / 16). Used wherever a
 * contract-read fails, including the expected NOT_IMPLEMENTED case that
 * every page hits today since the contract isn't deployed until Phase 4.
 *
 * `onRetry` (Phase 7, "RPC Resilience") lets a caller offer a real retry —
 * typically `useContractRead`'s `refetch` — for a transient failure like an
 * RPC hiccup, without this component guessing on its own whether a retry
 * makes sense for every error code. */
export function ErrorNotice({ error, onRetry }: { error: AppError; onRetry?: () => void }) {
  const tone = error.code === "NOT_IMPLEMENTED" ? "info" : "danger";
  const toneClasses =
    tone === "info" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-red-200 bg-red-50 text-red-800";

  return (
    <div className={`rounded-lg border p-4 text-sm ${toneClasses}`} role="status">
      <p className="font-medium">{error.message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

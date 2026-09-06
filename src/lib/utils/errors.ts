/**
 * Consistent application error strategy (docs/architecture.md section 14 / 16).
 *
 * Every place that catches a raw error (wallet rejection, contract revert,
 * network failure, missing env var) funnels it through `toAppError` so
 * components only ever render a small, understandable set of error codes —
 * never a raw stack trace. The original error is preserved on `.cause` for
 * development-time debugging (logged, never rendered) via `logDevError`.
 */
import { ConfigError } from "@/lib/genlayer/config";
import { NotImplementedError } from "@/lib/genlayer/milestone";
import { classifyBlockchainError } from "@/lib/genlayer/errors";
import type { AppError, AppErrorCode } from "@/types";

const APP_ERROR_CODES = new Set<AppErrorCode>([
  "WALLET_NOT_CONNECTED",
  "WRONG_NETWORK",
  "USER_REJECTED",
  "UNSUPPORTED_WALLET",
  "INSUFFICIENT_BALANCE",
  "INVALID_ADDRESS",
  "INVALID_INPUT",
  "INVALID_STATE",
  "MILESTONE_NOT_FOUND",
  "TRANSACTION_FAILED",
  "TRANSACTION_TIMEOUT",
  "CONTRACT_ERROR",
  "RPC_ERROR",
  "MISSING_ENV_VAR",
  "GENLAYER_UNAVAILABLE",
  "NOT_IMPLEMENTED",
  "UNKNOWN",
]);

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (error instanceof ConfigError) {
    return { code: "MISSING_ENV_VAR", message: error.message, cause: error };
  }

  if (error instanceof NotImplementedError) {
    return {
      code: "NOT_IMPLEMENTED",
      message: "This action isn't available yet — the WorkResolve contract hasn't been deployed.",
      cause: error,
    };
  }

  const blockchainError = classifyBlockchainError(error);
  if (blockchainError) return blockchainError;

  if (error instanceof Error) {
    return { code: "UNKNOWN", message: humanizeMessage(error.message), cause: error };
  }

  return { code: "UNKNOWN", message: "Something went wrong. Please try again.", cause: error };
}

export function makeAppError(code: AppErrorCode, message: string, cause?: unknown): AppError {
  return { code, message, cause };
}

function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string" &&
    APP_ERROR_CODES.has((value as { code: unknown }).code as AppErrorCode)
  );
}

/** Strips common noisy prefixes from provider/wallet error messages so the
 * fallback UNKNOWN-code message is at least readable, without pretending to
 * fully parse every possible revert format (that's still development-only). */
function humanizeMessage(message: string): string {
  const trimmed = message.split("\n")[0]?.trim() ?? message;
  return trimmed.length > 160 ? `${trimmed.slice(0, 160)}…` : trimmed;
}

/** Development-only console logging of the full error. Never call this to
 * render user-facing text — use `toAppError(...).message` for that. */
export function logDevError(context: string, error: unknown): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`[WorkResolve] ${context}:`, error);
  }
}

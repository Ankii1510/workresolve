"use client";

/**
 * Shared transaction status machine (docs/architecture.md section 13).
 *
 * States: IDLE -> WAITING_FOR_SIGNATURE -> SUBMITTING -> CONFIRMING ->
 * SUCCESS | FAILED.
 *
 * This hook is the ONE place that owns transaction lifecycle state. Every
 * future write action (fundMilestone, submitWork, evaluateAndFinalize,
 * releasePayment, refundClient, ...) wraps its call with `run()` from this
 * hook rather than each page hand-rolling its own loading booleans.
 *
 * Phase 3 note: this hook is transport-agnostic — it does not know about
 * genlayer-js or the contract. It just sequences an async action through
 * the status states and captures errors via the shared AppError shape. It
 * is exercised today by wrapping the contract.ts stubs (which throw
 * NotImplementedError, correctly resulting in a FAILED status with a
 * NOT_IMPLEMENTED error) — no fake success path exists.
 */
import { useCallback, useState } from "react";
import { toAppError } from "@/lib/utils/errors";
import type { AppError, ContractAction, TransactionStatus } from "@/types";

interface UseTransactionResult<TResult extends { txHash: string }> {
  status: TransactionStatus;
  hash: string | null;
  error: AppError | null;
  isPending: boolean;
  reset: () => void;
  /**
   * Runs an async action through the full status lifecycle.
   * `action` should perform signing (report via onSigned not needed — the
   * caller's async function IS the signing step from the wallet's
   * perspective) and resolve with `{ txHash, ... }` on success — the full
   * result (e.g. a resolved `milestoneId`) is returned so callers don't
   * need to re-derive it.
   */
  run: (action: () => Promise<TResult>) => Promise<TResult | null>;
}

export function useTransaction<TResult extends { txHash: string } = { txHash: string }>(
  _label: ContractAction | string,
): UseTransactionResult<TResult> {
  const [status, setStatus] = useState<TransactionStatus>("IDLE");
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  const reset = useCallback(() => {
    setStatus("IDLE");
    setHash(null);
    setError(null);
  }, []);

  const run = useCallback(async (action: () => Promise<TResult>) => {
    setError(null);
    setHash(null);
    setStatus("WAITING_FOR_SIGNATURE");
    try {
      setStatus("SUBMITTING");
      const result = await action();
      setHash(result.txHash);
      // `action()` above (see lib/genlayer/transactions.ts's
      // sendWriteTransaction) already awaits GenLayer's FINALIZED status
      // before resolving — by the time we get here the transaction is
      // genuinely confirmed, not merely submitted. CONFIRMING is shown
      // briefly for UX consistency with the documented status sequence
      // (WAITING_FOR_SIGNATURE -> SUBMITTING -> CONFIRMING -> SUCCESS),
      // then SUCCESS reflects a real, already-finalized transaction — see
      // docs/frontend.md "Transaction Lifecycle".
      setStatus("CONFIRMING");
      setStatus("SUCCESS");
      return result;
    } catch (err) {
      setStatus("FAILED");
      setError(toAppError(err));
      return null;
    }
  }, []);

  return {
    status,
    hash,
    error,
    isPending: status === "WAITING_FOR_SIGNATURE" || status === "SUBMITTING" || status === "CONFIRMING",
    reset,
    run,
  };
}

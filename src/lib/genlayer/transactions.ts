/**
 * Shared transaction submission + confirmation helper for every WorkResolve
 * write call (Phase 5). Every function in `milestone.ts` that mutates
 * contract state routes through `sendWriteTransaction` here rather than
 * hand-rolling its own `writeContract` + `waitForTransactionReceipt` pair,
 * so there is exactly one place that decides what "confirmed" and "failed"
 * mean.
 *
 * Confirmed from genlayer-js@1.1.8's own type declarations (inspected
 * directly, see node_modules/genlayer-js/dist/index-C3Ul1Rte.d.ts):
 *   - `writeContract({ account?, address, functionName, args, value })`
 *     resolves once the write is accepted by the client (not yet finalized).
 *   - `waitForTransactionReceipt({ hash, status, interval, retries })`
 *     polls until the transaction reaches the given `TransactionStatus`
 *     (we use `FINALIZED`, the terminal, fully-decided status).
 *   - A finalized `GenLayerTransaction`'s `txExecutionResultName` is
 *     `"FINISHED_WITH_RETURN"` on success or `"FINISHED_WITH_ERROR"` on a
 *     contract-side revert; `consensus_data.leader_receipt[]` carries each
 *     validator's own `error` string when the execution failed.
 *
 * `interval`/`retries` on `waitForTransactionReceipt`: left unspecified
 * this inherits genlayer-js's own default (`transactionsConfig` in the
 * installed package — 3s interval x 10 retries = 30s total), confirmed by
 * reading the installed package's own source
 * (node_modules/genlayer-js/dist/index.js). The first real write against
 * the live Asimov testnet (a plain create_milestone call, deployment tx
 * 0xbcb132...) was still showing "Sending" (not yet finalized) in
 * GenLayer's own explorer well past that 30s window — real multi-validator
 * consensus on a public testnet is legitimately slower than genlayer-js's
 * conservative default assumes. Overriding both here to 5s x 60 (5 minutes
 * total) so a normal write has a realistic chance to actually finalize
 * before this throws — a client-side timeout after 30s was never evidence
 * the transaction failed (see errors.ts's TRANSACTION_TIMEOUT handling and
 * TransactionStatusBanner's separate, non-alarming treatment of it), just
 * evidence this app gave up checking too early.
 */
const WAIT_FOR_RECEIPT_INTERVAL_MS = 5000;
const WAIT_FOR_RECEIPT_RETRIES = 60;
import { TransactionStatus, type GenLayerTransaction, type TransactionHash } from "genlayer-js/types";
import type { AppGenLayerClient } from "./client";
import { ContractRevertError, friendlyRevertMessage } from "./errors";

export { ContractRevertError };

export interface WriteCallArgs {
  functionName: string;
  args: unknown[];
  value?: bigint;
}

export interface WriteResult {
  txHash: string;
  receipt: GenLayerTransaction;
}

/**
 * Submits a write transaction and waits for it to reach GenLayer's
 * FINALIZED status, then throws a `ContractRevertError` (with a friendly,
 * user-facing message — see errors.ts) if the finalized execution failed.
 * Never returns a fabricated hash: the hash returned is exactly whatever
 * `writeContract` resolved with.
 */
export async function sendWriteTransaction(
  client: AppGenLayerClient,
  address: `0x${string}`,
  call: WriteCallArgs,
): Promise<WriteResult> {
  const hashResult = await client.writeContract({
    address,
    functionName: call.functionName,
    args: call.args as never,
    value: call.value ?? BigInt(0),
  });
  const txHash = hashResult as TransactionHash;

  // TransactionStatus.FINALIZED is GenLayer's terminal, fully-decided
  // status (see genlayer-js's TransactionStatus enum) — waiting for it
  // (rather than an earlier phase like ACCEPTED) is what "confirmed" means
  // for this app's UX, per the Phase 5 "do not optimistically show success"
  // requirement.
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    status: TransactionStatus.FINALIZED,
    interval: WAIT_FOR_RECEIPT_INTERVAL_MS,
    retries: WAIT_FOR_RECEIPT_RETRIES,
  });

  if (receipt.txExecutionResultName === "FINISHED_WITH_ERROR") {
    const rawReason = extractRevertReason(receipt);
    throw new ContractRevertError(rawReason, friendlyRevertMessage(rawReason));
  }

  return { txHash, receipt };
}

function extractRevertReason(receipt: GenLayerTransaction): string {
  const leaderReceipts = receipt.consensus_data?.leader_receipt;
  const firstError = Array.isArray(leaderReceipts)
    ? leaderReceipts.find((r) => r?.error)?.error
    : undefined;
  return firstError || "The contract rejected this transaction.";
}

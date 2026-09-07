/**
 * Blockchain-specific error classification (Phase 5).
 *
 * `src/lib/utils/errors.ts`'s `toAppError` is the single funnel every catch
 * block in the app uses; this module is where it delegates for anything
 * that came from the GenLayer client, the injected wallet provider, or a
 * contract revert, so those raw shapes (EIP-1193 error objects, a finalized
 * GenLayerTransaction whose execution failed, a fetch/RPC failure) are only
 * parsed in one place.
 *
 * Revert-message mapping (`friendlyRevertMessage`) is built directly from
 * the exact `raise ValueError(...)` strings in contracts/workresolve.py —
 * see docs/contracts.md's "Functions" table for which method raises what.
 * Anything not matched falls back to the raw (truncated) message rather
 * than a made-up generic one, so a real revert is never silently hidden.
 */
import type { AppError } from "@/types";

/** Thrown by lib/genlayer/transactions.ts's sendWriteTransaction when a
 * finalized transaction's execution failed (txExecutionResultName ===
 * "FINISHED_WITH_ERROR"). Defined here (rather than in transactions.ts) so
 * this module can recognize it directly in classifyBlockchainError below
 * without a circular import. */
export class ContractRevertError extends Error {
  constructor(
    public readonly rawReason: string,
    public readonly friendlyMessage: string,
  ) {
    super(friendlyMessage);
    this.name = "ContractRevertError";
  }
}

const USER_REJECTED_CODES = new Set([4001, "ACTION_REJECTED"]);

/** EIP-1193 / JSON-RPC codes and viem-style messages that mean "the wallet
 * would not have enough native balance to cover this transaction". */
const INSUFFICIENT_BALANCE_PATTERNS = [
  /insufficient funds/i,
  /insufficient balance/i,
  /exceeds balance/i,
];

const NETWORK_ERROR_PATTERNS = [/network error/i, /failed to fetch/i, /networkerror/i, /econnrefused/i];
const TIMEOUT_PATTERNS = [/timeout/i, /timed out/i];

/** EIP-1474 JSON-RPC error code -32001 ("Resource not found") / viem's
 * `ResourceNotFoundRpcError` (shortMessage: "Requested resource not
 * found."). Confirmed by reading genlayer-js@1.1.8's own source
 * (node_modules/genlayer-js/dist/index.js): every contract read goes
 * through a custom `gen_call` JSON-RPC method, and this is the raw error
 * GenLayer's node sends back over that method — most often seen for a
 * contract address the specific RPC node hasn't caught up on yet (e.g.
 * immediately after a fresh deployment/redeployment), not a bug in this
 * app's own request. Before this was recognized here, it fell all the way
 * through to the generic UNKNOWN fallback in lib/utils/errors.ts, which
 * shows the raw viem message verbatim — confusing and not actionable. */
const RESOURCE_NOT_FOUND_CODE = -32001;

export function isResourceNotFoundError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (code === RESOURCE_NOT_FOUND_CODE) return true;
  }
  const message = extractMessage(error) ?? "";
  return /requested resource not found/i.test(message);
}

/** GenLayer's node itself failing to resolve a contract's current state
 * because it can't fetch "the latest accepted transaction" for that
 * address. Confirmed real, not app-side: reproduced with the exact same
 * message via `npx genlayer call <address> get_milestone --args 1` directly
 * (no frontend involved) on 2026-09-08, while two `fund_milestone`
 * transactions against this contract were stuck in `NOT_VOTED`/idle limbo
 * (0/5 validators ever voted) — see docs/limitations.md. `genlayer finalize`
 * on those stuck transactions also reverted at GenLayer's own consensus
 * contract layer (EVM revert, unrelated to this app's code), which is
 * consistent with this being a GenLayer Asimov testnet-side liveness issue,
 * not anything wrong with WorkResolve's contract or this frontend's request.
 * Before this was recognized here, it fell through to the generic UNKNOWN
 * fallback, which showed viem's raw, actively misleading shortMessage —
 * "Missing or invalid parameters. Double check you have provided the
 * correct parameters." — even though no parameter was ever wrong. */
const CONTRACT_STATE_UNAVAILABLE_PATTERNS = [
  /failed to get contract state/i,
  /getting latest accepted transaction/i,
  /failed to get latest accepted transactions?/i,
];

export function isContractStateUnavailableError(error: unknown): boolean {
  const message = extractMessage(error) ?? "";
  return CONTRACT_STATE_UNAVAILABLE_PATTERNS.some((p) => p.test(message));
}

/** Maps a substring of a contract revert reason to a short, user-facing
 * explanation. Order matters — more specific patterns first. Every pattern
 * here is taken verbatim from a `raise ValueError(...)` message in
 * contracts/workresolve.py. */
const REVERT_MESSAGE_MAP: Array<[RegExp, string]> = [
  [/payment has already been released/i, "Payment has already been released for this milestone."],
  [/already been refunded/i, "This milestone has already been refunded."],
  [/does not match the agreed amount/i, "The amount sent doesn't match this milestone's escrow amount."],
  [/only the client who created this milestone/i, "Only the client who created this milestone can do that."],
  [/only the assigned freelancer/i, "Only the freelancer assigned to this milestone can do that."],
  [/only the client can cancel/i, "Only the client can cancel this milestone."],
  [/client and freelancer must be different/i, "The client and freelancer must be different wallet addresses."],
  [/weights must sum to 100/i, "Requirement weights must add up to exactly 100%."],
  [/at least one requirement is required/i, "At least one requirement is required."],
  [/requirement description cannot be empty/i, "Every requirement needs a description."],
  [/amount must be greater than zero/i, "The escrow amount must be greater than zero."],
  [/deadline must be a valid future/i, "The deadline must be a valid future date/time."],
  [/approval threshold must be between/i, "The approval threshold must be between 1 and 100."],
  [/cannot cancel an accepted milestone before its deadline/i, "This milestone can't be cancelled until its deadline has passed."],
  [/is in state \S+, expected one of/i, "This action isn't allowed in the milestone's current state."],
  [/does not exist/i, "This milestone doesn't exist."],
  [/provide at least a deployed url or a repository url/i, "Provide at least a deployed URL or a repository URL."],
  [/at most \d+ evidence items/i, "Too many evidence links — please remove some."],
];

export function friendlyRevertMessage(rawReason: string): string {
  for (const [pattern, friendly] of REVERT_MESSAGE_MAP) {
    if (pattern.test(rawReason)) return friendly;
  }
  const trimmed = rawReason.trim();
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed || "The contract rejected this transaction.";
}

/** EIP-1193 code 4200 = "Unsupported Method"; some non-compliant injected
 * wallets also throw a plain "not supported"/"not a function" style message
 * when asked for eth_requestAccounts/eth_chainId. */
export function isUnsupportedWallet(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code === 4200) return true;
  const message = extractMessage(error) ?? "";
  return /unsupported method|not supported|is not a function/i.test(message);
}

export function isUserRejection(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (USER_REJECTED_CODES.has(code as number | string)) return true;
  const message = extractMessage(error);
  return /user rejected|user denied|rejected the request/i.test(message ?? "");
}

export function isInsufficientBalance(error: unknown): boolean {
  const message = extractMessage(error) ?? "";
  return INSUFFICIENT_BALANCE_PATTERNS.some((p) => p.test(message));
}

export function isNetworkError(error: unknown): boolean {
  const message = extractMessage(error) ?? "";
  return NETWORK_ERROR_PATTERNS.some((p) => p.test(message));
}

export function isTimeoutError(error: unknown): boolean {
  const message = extractMessage(error) ?? "";
  return TIMEOUT_PATTERNS.some((p) => p.test(message));
}

function extractMessage(error: unknown): string | null {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const m = (error as { message: unknown }).message;
    return typeof m === "string" ? m : null;
  }
  return null;
}

/**
 * Classifies a raw error thrown from a GenLayer client call (readContract,
 * writeContract, waitForTransactionReceipt, or the injected wallet
 * provider) into an AppError. Returns null if the error doesn't match any
 * blockchain-specific shape, so the generic `toAppError` fallback in
 * src/lib/utils/errors.ts can still handle it.
 */
export function classifyBlockchainError(error: unknown): AppError | null {
  if (error instanceof ContractRevertError) {
    return { code: "CONTRACT_ERROR", message: error.friendlyMessage, cause: error };
  }
  if (isUserRejection(error)) {
    return { code: "USER_REJECTED", message: "Transaction was rejected in your wallet.", cause: error };
  }
  if (isUnsupportedWallet(error)) {
    return {
      code: "UNSUPPORTED_WALLET",
      message: "Your wallet doesn't support the method WorkResolve needs. Try a different EIP-1193 wallet.",
      cause: error,
    };
  }
  if (isInsufficientBalance(error)) {
    return {
      code: "INSUFFICIENT_BALANCE",
      message: "Your wallet doesn't have enough balance to cover this transaction.",
      cause: error,
    };
  }
  if (isTimeoutError(error)) {
    return {
      code: "TRANSACTION_TIMEOUT",
      message: "The transaction is taking longer than expected to confirm. It may still complete — check back shortly.",
      cause: error,
    };
  }
  if (isNetworkError(error)) {
    return {
      code: "RPC_ERROR",
      message: "Couldn't reach the GenLayer network. Check your connection and try again.",
      cause: error,
    };
  }
  if (isResourceNotFoundError(error)) {
    return {
      code: "GENLAYER_UNAVAILABLE",
      message:
        "GenLayer can't find this contract's code on the network right now. Right after a deployment " +
        "this can briefly mean the network hasn't caught up yet — wait a bit and try again. If it doesn't " +
        "clear up, it usually means the deployment itself never finished successfully (see " +
        "docs/limitations.md's note on GenVM's runner-comment parsing for a real example of this).",
      cause: error,
    };
  }
  if (isContractStateUnavailableError(error)) {
    return {
      code: "GENLAYER_UNAVAILABLE",
      message:
        "GenLayer's network can't currently resolve this contract's latest state — this is not a " +
        "problem with anything you entered. It's usually a temporary liveness issue on GenLayer's " +
        "testnet (validators not picking up a transaction). Wait a bit and try again; if it persists, " +
        "see docs/limitations.md for how this was confirmed to be network-side, not app-side.",
      cause: error,
    };
  }
  const message = extractMessage(error);
  if (message && /revert|value error|raise/i.test(message)) {
    return { code: "CONTRACT_ERROR", message: friendlyRevertMessage(message), cause: error };
  }
  return null;
}

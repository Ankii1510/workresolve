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
import { getGenLayerConfig } from "@/lib/genlayer/config";

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

/**
 * GenLayer's node saying, at transaction-submission time, that the contract
 * a write is addressed to does not exist ON THAT NETWORK at all.
 *
 * REAL, CONFIRMED BUG THIS EXISTS FOR (2026-09-09/10) — the single most
 * expensive misdiagnosis in this project so far, so the full story is here
 * to stop the next one:
 *
 * WorkResolve's Studio address env var was set to
 * `0x941F3904D19b39113d82AA3dC8942966b33fCB64`, a contract that had been
 * deployed while the deploying terminal's genlayer-cli was still pointed at
 * `testnet-asimov` — so it lives on ASIMOV, not Studio. With the app's
 * network switcher on Studio, every write was therefore asking *Studio's*
 * consensus contract (0xb7278A61…) to call a contract that only exists on
 * Asimov. GenLayer's Studio node replied, precisely and correctly:
 *
 *     { code: -32001, message: "Contract not found",
 *       data: { address: "0x941F3904…" } }
 *
 * Two things made this take a day to find. First, reads kept working:
 * `genlayer code <address>` succeeded the whole time — because that CLI was
 * *also* on Asimov, so it was reading the contract from the network the
 * contract was actually on. Second, the wallet swallowed the message: OKX
 * re-wrapped the node's reply as an opaque `{ code: -32603, message:
 * "Transaction failed", data: { originalError: {} } }` with the real reason
 * emptied out, which surfaced in the UI as "An internal error was received."
 * It only became legible when the same transaction was retried through a
 * different (ethers-based) wallet, which passed the node's original error
 * through verbatim.
 *
 * So this matcher deliberately searches the WHOLE error object graph, not
 * just its top-level `message`: the useful text is routinely buried under
 * `details` / `cause` / `data` / `originalError`, or embedded inside a
 * larger string (ethers stringifies the node's JSON into its own message).
 * A wallet that erases the reason entirely — as OKX did — still cannot be
 * classified here; nothing in this app can recover information the wallet
 * threw away. That is a real, accepted limit, not an oversight.
 */
const CONTRACT_NOT_FOUND_PATTERN = /contract\s+(?:0x[a-fA-F0-9]{40}\s+)?not\s+found/i;

/** Walks an arbitrary thrown value's object graph, collecting every string
 * it finds under the keys errors actually nest useful text in. Depth- and
 * breadth-bounded, and cycle-safe, because this runs inside a catch block
 * and must never itself throw or hang. */
function collectErrorStrings(error: unknown, depth = 0, seen = new Set<unknown>()): string[] {
  if (depth > 4 || error == null) return [];
  if (typeof error === "string") return [error];
  if (typeof error !== "object") return [];
  if (seen.has(error)) return [];
  seen.add(error);

  const out: string[] = [];
  const record = error as Record<string, unknown>;
  for (const key of ["message", "shortMessage", "details", "reason", "cause", "data", "originalError", "error", "info", "body"]) {
    if (key in record) out.push(...collectErrorStrings(record[key], depth + 1, seen));
  }
  return out;
}

export function isContractNotFoundError(error: unknown): boolean {
  return collectErrorStrings(error).some((s) => CONTRACT_NOT_FOUND_PATTERN.test(s));
}

/** The contract address GenLayer named as missing, when it gave one — either
 * as a structured `data.address` or inline in the message text. Used only to
 * make the message concrete; absence of it must never suppress the error. */
export function extractNotFoundAddress(error: unknown): string | null {
  const direct = findAddressField(error);
  if (direct) return direct;
  for (const s of collectErrorStrings(error)) {
    const match = s.match(/contract\s+(0x[a-fA-F0-9]{40})\s+not\s+found/i) ?? s.match(/"address"\s*:\s*"(0x[a-fA-F0-9]{40})"/i);
    if (match) return match[1];
  }
  return null;
}

function findAddressField(error: unknown, depth = 0, seen = new Set<unknown>()): string | null {
  if (depth > 4 || error == null || typeof error !== "object") return null;
  if (seen.has(error)) return null;
  seen.add(error);

  const record = error as Record<string, unknown>;
  const address = record.address;
  if (typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address)) return address;
  for (const key of ["data", "cause", "originalError", "error", "info"]) {
    if (key in record) {
      const found = findAddressField(record[key], depth + 1, seen);
      if (found) return found;
    }
  }
  return null;
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

/** Names the network the app is currently pointed at, for the
 * contract-not-found message above — that pairing (this address, on THIS
 * network) is the whole diagnosis, so it is worth reaching into config for.
 * Guarded because config throws on a malformed NEXT_PUBLIC_GENLAYER_NETWORK,
 * and an error-classifier that can itself throw is worse than a vague
 * message. */
function describeActiveNetwork(): string {
  try {
    return getGenLayerConfig().chain.name;
  } catch {
    return "the selected GenLayer network";
  }
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
  // MUST stay ahead of isResourceNotFoundError: GenLayer sends "Contract not
  // found" with code -32001, which that broader check also matches, but its
  // message ("the network hasn't caught up with your deployment yet") is
  // actively wrong here and sent a day of debugging in the wrong direction.
  // See isContractNotFoundError's docstring for the incident.
  if (isContractNotFoundError(error)) {
    const address = extractNotFoundAddress(error);
    return {
      code: "GENLAYER_UNAVAILABLE",
      message:
        `GenLayer says there is no contract at ${address ?? "the configured address"} on ` +
        `${describeActiveNetwork()}. The most common cause is an address from a *different* ` +
        "GenLayer network: a contract deployed on Asimov does not exist on Studio, and vice versa. " +
        "Check which network is selected against the address configured for it " +
        "(NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_* — see .env.example), and confirm the address " +
        "on that network's own explorer before assuming the network is at fault.",
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

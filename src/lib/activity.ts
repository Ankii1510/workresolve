/**
 * Local, per-wallet transaction activity log (Phase 7, section 13/15).
 *
 * `contracts/workresolve.py` has no confirmed custom-event API (see
 * docs/contracts.md "Known Limitations"), and this app deliberately doesn't
 * introduce a database or indexer just to reconstruct "everything this
 * wallet has ever done" (see docs/frontend.md "Event/Indexing Approach" —
 * the same reasoning applies here: the smallest robust architecture wins).
 * So this is NOT a full historical ledger — it only ever records
 * transactions that were submitted from *this browser*, at the moment they
 * confirm. Loading the same wallet in a different browser, or after
 * clearing site data, starts with an empty log. That honesty is the point:
 * every entry here is a transaction this session genuinely observed
 * confirming, never a guess reconstructed from chain state.
 *
 * For "what happened to milestone X ever" (regardless of which browser
 * acted), the milestone detail page's timeline (built from real on-chain
 * timestamp fields) remains the authoritative view — see
 * src/app/milestones/[id]/MilestoneDetailView.tsx's `buildTimeline`.
 */
import type { ContractAction } from "@/types";

export interface ActivityEntry {
  txHash: string;
  action: ContractAction;
  milestoneId: string;
  /** When THIS BROWSER recorded the confirmation — a local wall-clock
   * reading, not a blockchain timestamp. */
  recordedAt: number;
}

const STORAGE_PREFIX = "workresolve:activity:";
const MAX_ENTRIES = 200;

function storageKey(walletAddress: string): string {
  return `${STORAGE_PREFIX}${walletAddress.toLowerCase()}`;
}

/** Records a confirmed transaction for this wallet, in this browser only.
 * Never throws — a localStorage failure (private browsing, quota, disabled
 * storage) must never break a transaction flow that already succeeded
 * on-chain. */
export function recordActivity(
  walletAddress: string,
  entry: Omit<ActivityEntry, "recordedAt">,
): void {
  if (typeof window === "undefined") return;
  try {
    const existing = readActivity(walletAddress);
    const next = [
      { ...entry, recordedAt: Date.now() },
      ...existing.filter((e) => e.txHash !== entry.txHash),
    ].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(storageKey(walletAddress), JSON.stringify(next));
  } catch {
    // Deliberately swallowed — see module docstring.
  }
}

/** Reads this wallet's locally-recorded activity, newest first. Never
 * throws — a parse failure or unavailable storage just yields no history. */
export function readActivity(walletAddress: string): ActivityEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(walletAddress));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ActivityEntry[]) : [];
  } catch {
    return [];
  }
}

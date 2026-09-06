/**
 * Deadline display helpers (Phase 7, section 17/18).
 *
 * Purely cosmetic — `contracts/workresolve.py` is, and remains, the only
 * authoritative source of deadline enforcement (only `cancel_milestone`
 * actually gates on the deadline; `submit_work` does not, see
 * docs/evaluation.md "Freelancer Submission"). Nothing here ever disables an
 * action the contract would accept, and nothing here enables an action the
 * contract would reject — nowUnix is passed in explicitly (rather than read
 * from `Date.now()` inside this module) specifically so a UI never claims an
 * authoritative answer about "now" relative to the chain; it's the caller's
 * job to treat this as advisory display copy only.
 */
export type DeadlineTone = "normal" | "soon" | "passed";

export interface DeadlineDescription {
  tone: DeadlineTone;
  label: string; // e.g. "Due soon" / "Deadline passed" / "" for normal
  formatted: string; // e.g. "September 12, 2026"
}

/** A deadline within this many seconds counts as "due soon". 3 days. */
export const DUE_SOON_WINDOW_SECONDS = 3 * 24 * 60 * 60;

export function describeDeadline(deadlineUnix: number, nowMs: number = Date.now()): DeadlineDescription {
  const formatted = new Date(deadlineUnix * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const secondsRemaining = deadlineUnix - Math.floor(nowMs / 1000);

  if (secondsRemaining <= 0) {
    return { tone: "passed", label: "Deadline passed", formatted };
  }
  if (secondsRemaining <= DUE_SOON_WINDOW_SECONDS) {
    return { tone: "soon", label: "Due soon", formatted };
  }
  return { tone: "normal", label: "", formatted };
}

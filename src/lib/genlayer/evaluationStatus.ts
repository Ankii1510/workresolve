/**
 * Frontend-facing evaluation status derivation (Phase 6).
 *
 * The spec for this phase asks for explicit states: NOT_STARTED, EVALUATING,
 * CONSENSUS_PENDING, FINALIZED, FAILED — but adapted to what GenLayer
 * actually exposes, never invented. The only evaluation-related values
 * contracts/workresolve.py's Milestone.state can genuinely hold are
 * "SUBMITTED" (not yet evaluated), "EVALUATING" (set internally by
 * evaluate_and_finalize before its non-deterministic closure runs), and
 * "APPROVED"/"REJECTED" (finalized) — see contracts/workresolve.py's
 * evaluate_and_finalize docstring.
 *
 * Whether a separate `get_milestone` read can ever actually observe
 * "EVALUATING" *before* the evaluate_and_finalize transaction that sets it
 * finalizes is NOT confirmed in this environment (no live GenVM run was
 * possible here — see docs/contracts.md "Known Limitations"): most smart
 * contract execution models only commit state atomically at the end of a
 * successful transaction, in which case no external reader ever observes an
 * intermediate value at all. So this module derives the UI status from two
 * independently real sources rather than assuming "EVALUATING" is visible
 * to everyone:
 *
 *   1. The on-chain `milestone.state`, whatever a read returns.
 *   2. The *local* lifecycle of this browser's own evaluateAndFinalize call
 *      (useTransaction's WAITING_FOR_SIGNATURE/SUBMITTING/CONFIRMING/FAILED)
 *      — which IS a real, first-hand signal that evaluation is in flight or
 *      failed, from the perspective of whoever triggered it.
 *
 * A visitor who did NOT trigger the evaluation and only reads the milestone
 * will see NOT_STARTED, then — once the transaction that triggered it
 * finalizes elsewhere — FINALIZED, with no live "consensus pending" tick for
 * them. That gap is documented, not hidden (see docs/evaluation.md
 * "Evaluation Status").
 */
import type { Milestone, RequirementStatus, TransactionStatus } from "@/types";

export type EvaluationUiStatus = "NOT_STARTED" | "EVALUATING" | "CONSENSUS_PENDING" | "FINALIZED" | "FAILED";

const FINALIZED_STATES = new Set<Milestone["state"]>(["APPROVED", "REJECTED", "RELEASED", "REFUNDED"]);

export function deriveEvaluationStatus(
  milestone: Pick<Milestone, "state"> | null,
  localEvalTxStatus: TransactionStatus,
): EvaluationUiStatus {
  if (milestone && FINALIZED_STATES.has(milestone.state)) return "FINALIZED";

  // This browser's own in-flight evaluateAndFinalize call is the most
  // specific signal available — prefer it over the (possibly stale) last
  // read of milestone.state.
  if (localEvalTxStatus === "WAITING_FOR_SIGNATURE" || localEvalTxStatus === "SUBMITTING") return "EVALUATING";
  if (localEvalTxStatus === "CONFIRMING") return "CONSENSUS_PENDING";
  if (localEvalTxStatus === "FAILED") return "FAILED";

  if (milestone?.state === "EVALUATING") return "CONSENSUS_PENDING"; // observed directly on-chain, if it ever is
  return "NOT_STARTED";
}

/** Mirrors contracts/workresolve.py's `_requirement_points` /
 * contracts/logic/workresolve_logic.py's `requirement_points` exactly, so
 * the UI can show a per-requirement point contribution even though the
 * contract's stored RequirementResult struct has no `score` field of its
 * own (see docs/contracts.md "Consensus Result"). This is purely a display
 * computation over already-finalized, on-chain statuses — it never feeds
 * back into any contract call. */
export function requirementPoints(status: RequirementStatus, weight: number): number {
  if (status === "PASS") return weight;
  if (status === "PARTIAL") return Math.floor(weight / 2);
  return 0; // FAIL, UNVERIFIABLE — never treated as passing
}

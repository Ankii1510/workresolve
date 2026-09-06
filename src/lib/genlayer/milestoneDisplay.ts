/**
 * Pure display-derivation helpers for milestone cards/lists (Phase 7,
 * dashboard polish). Every value here is derived strictly from real
 * `Milestone` fields — never a fabricated status or count — so dashboard
 * cards, the profile page, and the activity log all describe a milestone
 * the same way.
 */
import type { Milestone } from "@/types";

/** A short, human label for "what happened here most recently" — driven
 * entirely by `state`, which is itself only ever set by a confirmed
 * on-chain transition (see docs/frontend.md "Optimistic UI"). */
export function describeLastAction(milestone: Pick<Milestone, "state">): string {
  switch (milestone.state) {
    case "CREATED":
      return "Milestone created";
    case "FUNDED":
      return "Escrow funded";
    case "ACCEPTED":
      return "Milestone accepted";
    case "SUBMITTED":
      return "Work submitted";
    case "EVALUATING":
      return "Evaluation in progress";
    case "APPROVED":
      return "Evaluation approved";
    case "REJECTED":
      return "Evaluation rejected";
    case "RELEASED":
      return "Payment released";
    case "REFUNDED":
      return "Client refunded";
    case "CANCELLED":
      return "Milestone cancelled";
    default:
      return "Milestone updated";
  }
}

/** A short evaluation-stage label for a dashboard card — distinct from the
 * full MilestoneStateBadge, focused on "where is this in the eval flow". */
export function describeEvaluationStage(milestone: Pick<Milestone, "state">): string {
  switch (milestone.state) {
    case "CREATED":
    case "FUNDED":
    case "ACCEPTED":
      return "Not submitted";
    case "SUBMITTED":
      return "Awaiting evaluation";
    case "EVALUATING":
      return "Evaluating";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "RELEASED":
      return "Approved — paid";
    case "REFUNDED":
      return "Rejected — refunded";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "—";
  }
}

/** True for a milestone whose escrowed amount is genuinely locked right
 * now (funded but not yet settled) — used to compute a real "total
 * escrowed" dashboard stat, never an invented aggregate. */
export function hasFundsLocked(milestone: Pick<Milestone, "state">): boolean {
  return (
    milestone.state === "FUNDED" ||
    milestone.state === "ACCEPTED" ||
    milestone.state === "SUBMITTED" ||
    milestone.state === "EVALUATING" ||
    milestone.state === "APPROVED" ||
    milestone.state === "REJECTED"
  );
}

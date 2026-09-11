import { describe, expect, it } from "vitest";
import { canHaveSubmission, canHaveEvaluation } from "@/lib/genlayer/milestone";
import type { MilestoneState } from "@/types";

/**
 * Pins the 2026-09-11 fix: the milestone detail page asked the contract for a
 * submission on a FUNDED milestone, got the contract's correct refusal, and
 * rendered it as a red "Missing or invalid parameters / Try again" error next
 * to a successfully funded escrow. These predicates are what stop the question
 * being asked at all — see canHaveSubmission()'s docstring.
 *
 * Every state is asserted explicitly rather than by listing only the true
 * ones: adding a new MilestoneState should force a deliberate decision here,
 * not silently default to "no read" (which hides data) or "read anyway"
 * (which brings the error box back).
 */
const ALL_STATES: MilestoneState[] = [
  "CREATED",
  "FUNDED",
  "ACCEPTED",
  "SUBMITTED",
  "EVALUATING",
  "APPROVED",
  "REJECTED",
  "RELEASED",
  "REFUNDED",
  "CANCELLED",
];

describe("canHaveSubmission", () => {
  // submit_work is what writes the submission and sets SUBMITTED, so every
  // state from SUBMITTED onward has one.
  const EXPECTED: Record<MilestoneState, boolean> = {
    CREATED: false,
    FUNDED: false, // the exact state that produced the live bug
    ACCEPTED: false,
    SUBMITTED: true,
    EVALUATING: true,
    APPROVED: true,
    REJECTED: true,
    RELEASED: true,
    REFUNDED: true,
    CANCELLED: false, // cancel only accepts CREATED/FUNDED/ACCEPTED — never had one
  };

  for (const state of ALL_STATES) {
    it(`${state} -> ${EXPECTED[state]}`, () => {
      expect(canHaveSubmission({ state })).toBe(EXPECTED[state]);
    });
  }
});

describe("canHaveEvaluation", () => {
  // evaluate_and_finalize sets EVALUATING on the way IN, before the
  // non-deterministic block runs, and only writes the evaluation once it
  // finalizes — so EVALUATING must be false or the bug returns in a new place.
  const EXPECTED: Record<MilestoneState, boolean> = {
    CREATED: false,
    FUNDED: false,
    ACCEPTED: false,
    SUBMITTED: false,
    EVALUATING: false,
    APPROVED: true,
    REJECTED: true,
    RELEASED: true,
    REFUNDED: true,
    CANCELLED: false,
  };

  for (const state of ALL_STATES) {
    it(`${state} -> ${EXPECTED[state]}`, () => {
      expect(canHaveEvaluation({ state })).toBe(EXPECTED[state]);
    });
  }

  it("is never true where canHaveSubmission is false — an evaluation implies a submission", () => {
    for (const state of ALL_STATES) {
      if (canHaveEvaluation({ state })) expect(canHaveSubmission({ state })).toBe(true);
    }
  });
});

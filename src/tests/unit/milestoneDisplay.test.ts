import { describe, expect, it } from "vitest";
import {
  describeEvaluationStage,
  describeLastAction,
  hasFundsLocked,
} from "@/lib/genlayer/milestoneDisplay";
import type { MilestoneState } from "@/types";

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

describe("describeLastAction", () => {
  it("returns a distinct, non-empty label for every milestone state", () => {
    const labels = ALL_STATES.map((state) => describeLastAction({ state }));
    expect(labels.every((l) => l.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("describeEvaluationStage", () => {
  it("reports pre-submission states as 'Not submitted'", () => {
    expect(describeEvaluationStage({ state: "CREATED" })).toBe("Not submitted");
    expect(describeEvaluationStage({ state: "FUNDED" })).toBe("Not submitted");
    expect(describeEvaluationStage({ state: "ACCEPTED" })).toBe("Not submitted");
  });

  it("distinguishes SUBMITTED from EVALUATING", () => {
    expect(describeEvaluationStage({ state: "SUBMITTED" })).toBe("Awaiting evaluation");
    expect(describeEvaluationStage({ state: "EVALUATING" })).toBe("Evaluating");
  });

  it("distinguishes a finalized-but-unsettled result from a settled one", () => {
    expect(describeEvaluationStage({ state: "APPROVED" })).toBe("Approved");
    expect(describeEvaluationStage({ state: "RELEASED" })).toBe("Approved — paid");
    expect(describeEvaluationStage({ state: "REJECTED" })).toBe("Rejected");
    expect(describeEvaluationStage({ state: "REFUNDED" })).toBe("Rejected — refunded");
  });
});

describe("hasFundsLocked", () => {
  it("is true for every state where escrow is genuinely locked", () => {
    for (const state of ["FUNDED", "ACCEPTED", "SUBMITTED", "EVALUATING", "APPROVED", "REJECTED"] as const) {
      expect(hasFundsLocked({ state })).toBe(true);
    }
  });

  it("is false before funding and after settlement/cancellation", () => {
    for (const state of ["CREATED", "RELEASED", "REFUNDED", "CANCELLED"] as const) {
      expect(hasFundsLocked({ state })).toBe(false);
    }
  });
});

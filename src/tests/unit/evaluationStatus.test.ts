import { describe, expect, it } from "vitest";
import { deriveEvaluationStatus, requirementPoints } from "@/lib/genlayer/evaluationStatus";

describe("deriveEvaluationStatus", () => {
  it("is NOT_STARTED with no milestone loaded yet", () => {
    expect(deriveEvaluationStatus(null, "IDLE")).toBe("NOT_STARTED");
  });

  it("is NOT_STARTED once SUBMITTED but no local evaluate transaction has run", () => {
    expect(deriveEvaluationStatus({ state: "SUBMITTED" }, "IDLE")).toBe("NOT_STARTED");
  });

  it("is EVALUATING while this browser's own evaluate transaction is signing/submitting", () => {
    expect(deriveEvaluationStatus({ state: "SUBMITTED" }, "WAITING_FOR_SIGNATURE")).toBe("EVALUATING");
    expect(deriveEvaluationStatus({ state: "SUBMITTED" }, "SUBMITTING")).toBe("EVALUATING");
  });

  it("is CONSENSUS_PENDING while this browser's own evaluate transaction is confirming", () => {
    expect(deriveEvaluationStatus({ state: "SUBMITTED" }, "CONFIRMING")).toBe("CONSENSUS_PENDING");
  });

  it("is CONSENSUS_PENDING if the chain itself reports EVALUATING, even with no local transaction", () => {
    expect(deriveEvaluationStatus({ state: "EVALUATING" }, "IDLE")).toBe("CONSENSUS_PENDING");
  });

  it("is FAILED if this browser's own evaluate transaction failed and the milestone is still SUBMITTED", () => {
    expect(deriveEvaluationStatus({ state: "SUBMITTED" }, "FAILED")).toBe("FAILED");
  });

  it("is FINALIZED once the milestone reaches APPROVED", () => {
    expect(deriveEvaluationStatus({ state: "APPROVED" }, "IDLE")).toBe("FINALIZED");
  });

  it("is FINALIZED once the milestone reaches REJECTED", () => {
    expect(deriveEvaluationStatus({ state: "REJECTED" }, "IDLE")).toBe("FINALIZED");
  });

  it("stays FINALIZED after settlement (RELEASED/REFUNDED), never regressing", () => {
    expect(deriveEvaluationStatus({ state: "RELEASED" }, "IDLE")).toBe("FINALIZED");
    expect(deriveEvaluationStatus({ state: "REFUNDED" }, "IDLE")).toBe("FINALIZED");
  });

  it("prefers the on-chain finalized state over a stale local FAILED transaction status", () => {
    // e.g. this browser's evaluate call reverted because someone else's had
    // already finalized it first — the real on-chain outcome wins.
    expect(deriveEvaluationStatus({ state: "APPROVED" }, "FAILED")).toBe("FINALIZED");
  });
});

describe("requirementPoints", () => {
  it("awards full weight for PASS", () => {
    expect(requirementPoints("PASS", 40)).toBe(40);
  });

  it("awards half weight, rounded down, for PARTIAL", () => {
    expect(requirementPoints("PARTIAL", 15)).toBe(7);
  });

  it("awards zero for FAIL", () => {
    expect(requirementPoints("FAIL", 40)).toBe(0);
  });

  it("awards zero for UNVERIFIABLE — never treated as a pass", () => {
    expect(requirementPoints("UNVERIFIABLE", 40)).toBe(0);
  });
});

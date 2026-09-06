import { describe, expect, it, vi } from "vitest";
import { toAppError } from "@/lib/utils/errors";
import {
  acceptMilestone,
  canAcceptMilestone,
  canReleasePayment,
  canRefundClient,
  canTriggerEvaluation,
  createMilestone,
  evaluateAndFinalize,
  fundMilestone,
  getEvaluation,
  getMilestone,
  getSubmission,
  MilestoneNotFoundError,
  refundClient,
  releasePayment,
  submitWork,
  WalletNotConnectedError,
} from "@/lib/genlayer/milestone";
import type { AppGenLayerClient } from "@/lib/genlayer/client";

vi.mock("@/lib/genlayer/config", () => ({
  requireContractAddress: () => "0x0000000000000000000000000000000000dEaD",
  getGenLayerConfig: () => ({
    networkName: "testnetAsimov",
    chain: { id: 4221, name: "Genlayer Asimov Testnet" },
    endpointOverride: null,
    contractAddress: "0x0000000000000000000000000000000000dEaD",
  }),
  ConfigError: class ConfigError extends Error {},
}));

function mockClient(overrides: Partial<AppGenLayerClient> = {}): AppGenLayerClient {
  return {
    writeContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    readContract: vi.fn(),
    ...overrides,
  } as unknown as AppGenLayerClient;
}

const VALID_INPUT = {
  freelancer: "0x1234567890abcdef1234567890abcdef12345678",
  title: "Landing page",
  description: "Build a landing page.",
  requirementDescriptions: ["Responsive layout"],
  requirementWeights: [100],
  amount: "10",
  deadline: 9999999999,
};

describe("createMilestone", () => {
  it("throws WalletNotConnectedError when no write client is available", async () => {
    await expect(createMilestone(null, VALID_INPUT)).rejects.toBeInstanceOf(WalletNotConnectedError);
  });

  it("submits a real writeContract call and returns the confirmed tx hash on success", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0xabc123"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ txExecutionResultName: "FINISHED_WITH_RETURN" }),
      readContract: vi.fn().mockResolvedValue([]), // no client account on the mock -> milestoneId lookup is skipped/empty
    });

    const result = await createMilestone(client, VALID_INPUT);

    expect(result.txHash).toBe("0xabc123");
    expect(client.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "create_milestone", value: 0n }),
    );
  });

  it("surfaces a user-rejected wallet error as USER_REJECTED via toAppError", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockRejectedValue({ code: 4001, message: "User rejected the request." }),
    });

    await expect(createMilestone(client, VALID_INPUT)).rejects.toBeDefined();
    try {
      await createMilestone(client, VALID_INPUT);
    } catch (err) {
      expect(toAppError(err).code).toBe("USER_REJECTED");
    }
  });

  it("surfaces an insufficient-balance provider error as INSUFFICIENT_BALANCE via toAppError", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockRejectedValue(new Error("insufficient funds for gas * price + value")),
    });

    try {
      await createMilestone(client, VALID_INPUT);
      expect.unreachable("expected createMilestone to throw");
    } catch (err) {
      expect(toAppError(err).code).toBe("INSUFFICIENT_BALANCE");
    }
  });

  it("throws a friendly, mapped error when the finalized transaction reverted", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0xdef456"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        txExecutionResultName: "FINISHED_WITH_ERROR",
        consensus_data: {
          final: true,
          leader_receipt: [{ error: "ValueError: Requirement weights must sum to 100 (got 90)." }],
        },
      }),
    });

    try {
      await createMilestone(client, VALID_INPUT);
      expect.unreachable("expected createMilestone to throw");
    } catch (err) {
      const appError = toAppError(err);
      expect(appError.code).toBe("CONTRACT_ERROR");
      expect(appError.message).toMatch(/weights must add up to exactly 100/i);
    }
  });
});

describe("fundMilestone", () => {
  it("throws WalletNotConnectedError when no write client is available", async () => {
    await expect(fundMilestone(null, "1", 100n)).rejects.toBeInstanceOf(WalletNotConnectedError);
  });

  it("sends the milestone's exact amount as msg.value and returns the confirmed hash", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0x111222"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ txExecutionResultName: "FINISHED_WITH_RETURN" }),
    });

    const result = await fundMilestone(client, "1", 100n);

    expect(result.txHash).toBe("0x111222");
    expect(client.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "fund_milestone", args: ["1"], value: 100n }),
    );
  });

  it("maps an already-funded revert to a friendly, specific message", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0x333"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        txExecutionResultName: "FINISHED_WITH_ERROR",
        consensus_data: {
          final: true,
          leader_receipt: [{ error: 'ValueError("Milestone 1 is in state FUNDED, expected one of (\'CREATED\',).")' }],
        },
      }),
    });

    try {
      await fundMilestone(client, "1", 100n);
      expect.unreachable("expected fundMilestone to throw");
    } catch (err) {
      expect(toAppError(err).message).toMatch(/current state/i);
    }
  });
});

describe("getMilestone", () => {
  it("returns a fully parsed Milestone on a successful read", async () => {
    const client = mockClient({
      readContract: vi.fn().mockResolvedValue({
        milestone_id: "1",
        client: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        freelancer: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        title: "Landing page",
        description: "Build a landing page.",
        requirements: [{ id: 1, description: "Responsive layout", weight: 100 }],
        requirements_hash: "0xdeadbeef",
        amount: "10000000000000000000",
        approval_threshold: 70,
        deadline: 9999999999,
        state: "CREATED",
        paid: false,
        refunded: false,
        created_at: 1700000000,
        funded_at: 0,
        accepted_at: 0,
        submitted_at: 0,
        finalized_at: 0,
      }),
    });

    const milestone = await getMilestone(client, "1");

    expect(milestone.milestoneId).toBe("1");
    expect(milestone.state).toBe("CREATED");
    expect(milestone.requirements).toEqual([{ id: 1, description: "Responsive layout", weight: 100 }]);
    expect(milestone.amount).toBe("10000000000000000000");
  });

  it("throws MilestoneNotFoundError when the contract says the milestone doesn't exist", async () => {
    const client = mockClient({
      readContract: vi.fn().mockRejectedValue(new Error("Milestone 999 does not exist.")),
    });

    await expect(getMilestone(client, "999")).rejects.toBeInstanceOf(MilestoneNotFoundError);
  });

  it("propagates a generic RPC failure without misclassifying it as not-found", async () => {
    const client = mockClient({
      readContract: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    });

    await expect(getMilestone(client, "1")).rejects.toThrow("Failed to fetch");
    try {
      await getMilestone(client, "1");
    } catch (err) {
      expect(err).not.toBeInstanceOf(MilestoneNotFoundError);
      expect(toAppError(err).code).toBe("RPC_ERROR");
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 6 — freelancer acceptance, submission, evaluation, settlement
// ---------------------------------------------------------------------------

describe("acceptMilestone", () => {
  it("throws WalletNotConnectedError when no write client is available", async () => {
    await expect(acceptMilestone(null, "1")).rejects.toBeInstanceOf(WalletNotConnectedError);
  });

  it("submits accept_milestone and returns the confirmed hash", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0xacc001"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ txExecutionResultName: "FINISHED_WITH_RETURN" }),
    });
    const result = await acceptMilestone(client, "1");
    expect(result.txHash).toBe("0xacc001");
    expect(client.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "accept_milestone", args: ["1"] }),
    );
  });

  it("surfaces a wrong-wallet revert as a friendly, specific CONTRACT_ERROR", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0xacc002"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        txExecutionResultName: "FINISHED_WITH_ERROR",
        consensus_data: {
          leader_receipt: [{ error: "ValueError: Only the assigned freelancer can accept this milestone." }],
        },
      }),
    });
    try {
      await acceptMilestone(client, "1");
      expect.unreachable("expected acceptMilestone to throw");
    } catch (err) {
      const appError = toAppError(err);
      expect(appError.code).toBe("CONTRACT_ERROR");
      expect(appError.message).toMatch(/only the freelancer assigned/i);
    }
  });

  it("surfaces a wrong-state revert (e.g. not yet FUNDED) as a friendly message", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0xacc003"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        txExecutionResultName: "FINISHED_WITH_ERROR",
        consensus_data: {
          leader_receipt: [{ error: "Milestone 1 is in state CREATED, expected one of ('FUNDED',)." }],
        },
      }),
    });
    try {
      await acceptMilestone(client, "1");
      expect.unreachable("expected acceptMilestone to throw");
    } catch (err) {
      expect(toAppError(err).message).toMatch(/current state/i);
    }
  });
});

const SUBMIT_INPUT = {
  milestoneId: "1",
  deployedUrl: "https://example.com",
  repositoryUrl: "",
  evidenceUrls: ["https://example.com/demo"],
  description: "Done.",
};

describe("submitWork", () => {
  it("throws WalletNotConnectedError when no write client is available", async () => {
    await expect(submitWork(null, SUBMIT_INPUT)).rejects.toBeInstanceOf(WalletNotConnectedError);
  });

  it("submits submit_work with the given evidence and returns the confirmed hash", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0xsub001"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ txExecutionResultName: "FINISHED_WITH_RETURN" }),
    });
    const result = await submitWork(client, SUBMIT_INPUT);
    expect(result.txHash).toBe("0xsub001");
    expect(client.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "submit_work",
        args: ["1", "https://example.com", "", ["https://example.com/demo"], "Done."],
      }),
    );
  });

  it("surfaces a duplicate-evaluation-window revert (already past SUBMITTED) as a friendly message", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0xsub002"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        txExecutionResultName: "FINISHED_WITH_ERROR",
        consensus_data: {
          leader_receipt: [{ error: "Milestone 1 is in state APPROVED, expected one of ('ACCEPTED', 'SUBMITTED')." }],
        },
      }),
    });
    try {
      await submitWork(client, SUBMIT_INPUT);
      expect.unreachable("expected submitWork to throw");
    } catch (err) {
      expect(toAppError(err).message).toMatch(/current state/i);
    }
  });
});

describe("evaluateAndFinalize", () => {
  it("throws WalletNotConnectedError when no write client is available", async () => {
    await expect(evaluateAndFinalize(null, "1")).rejects.toBeInstanceOf(WalletNotConnectedError);
  });

  it("is permissionless: any connected wallet can call it and get the confirmed hash", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0xeval001"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ txExecutionResultName: "FINISHED_WITH_RETURN" }),
    });
    const result = await evaluateAndFinalize(client, "1");
    expect(result.txHash).toBe("0xeval001");
    expect(client.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "evaluate_and_finalize", args: ["1"] }),
    );
  });

  it("surfaces a malformed-evaluator-output revert as a CONTRACT_ERROR, never a fake success", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0xeval002"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        txExecutionResultName: "FINISHED_WITH_ERROR",
        consensus_data: {
          leader_receipt: [{ error: "ValueError: Evaluator returned invalid JSON: Expecting value" }],
        },
      }),
    });
    try {
      await evaluateAndFinalize(client, "1");
      expect.unreachable("expected evaluateAndFinalize to throw");
    } catch (err) {
      expect(toAppError(err).code).toBe("CONTRACT_ERROR");
    }
  });

  it("surfaces calling evaluation before a submission exists as a friendly state error", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0xeval003"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        txExecutionResultName: "FINISHED_WITH_ERROR",
        consensus_data: {
          leader_receipt: [{ error: "Milestone 1 is in state ACCEPTED, expected one of ('SUBMITTED',)." }],
        },
      }),
    });
    try {
      await evaluateAndFinalize(client, "1");
      expect.unreachable("expected evaluateAndFinalize to throw");
    } catch (err) {
      expect(toAppError(err).message).toMatch(/current state/i);
    }
  });
});

describe("releasePayment / refundClient", () => {
  it("releasePayment throws WalletNotConnectedError with no write client", async () => {
    await expect(releasePayment(null, "1")).rejects.toBeInstanceOf(WalletNotConnectedError);
  });

  it("refundClient throws WalletNotConnectedError with no write client", async () => {
    await expect(refundClient(null, "1")).rejects.toBeInstanceOf(WalletNotConnectedError);
  });

  it("releasePayment submits release_payment and returns the confirmed hash", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0xrel001"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ txExecutionResultName: "FINISHED_WITH_RETURN" }),
    });
    const result = await releasePayment(client, "1");
    expect(result.txHash).toBe("0xrel001");
    expect(client.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "release_payment", args: ["1"] }),
    );
  });

  it("releasePayment surfaces a double-release attempt as a friendly, specific message", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0xrel002"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        txExecutionResultName: "FINISHED_WITH_ERROR",
        consensus_data: {
          leader_receipt: [{ error: "Payment has already been released for this milestone." }],
        },
      }),
    });
    try {
      await releasePayment(client, "1");
      expect.unreachable("expected releasePayment to throw");
    } catch (err) {
      expect(toAppError(err).message).toMatch(/already been released/i);
    }
  });

  it("refundClient submits refund_client and returns the confirmed hash", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0xref001"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ txExecutionResultName: "FINISHED_WITH_RETURN" }),
    });
    const result = await refundClient(client, "1");
    expect(result.txHash).toBe("0xref001");
    expect(client.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "refund_client", args: ["1"] }),
    );
  });

  it("refundClient surfaces a double-refund attempt as a friendly, specific message", async () => {
    const client = mockClient({
      writeContract: vi.fn().mockResolvedValue("0xref002"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        txExecutionResultName: "FINISHED_WITH_ERROR",
        consensus_data: {
          leader_receipt: [{ error: "This milestone has already been refunded." }],
        },
      }),
    });
    try {
      await refundClient(client, "1");
      expect.unreachable("expected refundClient to throw");
    } catch (err) {
      expect(toAppError(err).message).toMatch(/already been refunded/i);
    }
  });
});

describe("getSubmission / getEvaluation", () => {
  it("getSubmission returns null (not an error) before any submission exists", async () => {
    const client = mockClient({
      readContract: vi.fn().mockRejectedValue(new Error("No submission exists yet for milestone 1.")),
    });
    await expect(getSubmission(client, "1")).resolves.toBeNull();
  });

  it("getSubmission parses a real submission", async () => {
    const client = mockClient({
      readContract: vi.fn().mockResolvedValue({
        deployed_url: "https://example.com",
        repository_url: "",
        evidence_urls: ["https://example.com/demo"],
        description: "Done.",
        submitted_at: 1700000100,
      }),
    });
    const submission = await getSubmission(client, "1");
    expect(submission).toEqual({
      milestoneId: "1",
      deployedUrl: "https://example.com",
      repositoryUrl: "",
      evidenceUrls: ["https://example.com/demo"],
      description: "Done.",
      submittedAt: 1700000100,
    });
  });

  it("getEvaluation returns null (not an error) before any evaluation exists", async () => {
    const client = mockClient({
      readContract: vi.fn().mockRejectedValue(new Error("No evaluation exists yet for milestone 1.")),
    });
    await expect(getEvaluation(client, "1")).resolves.toBeNull();
  });

  it("getEvaluation parses a real finalized APPROVE result", async () => {
    const client = mockClient({
      readContract: vi.fn().mockResolvedValue({
        score: 85,
        decision: "APPROVE",
        requirement_results: [
          { id: 1, status: "PASS", reason: "Looks good." },
          { id: 2, status: "PARTIAL", reason: "Mostly there." },
        ],
        summary: "85/100 — APPROVE.",
        finalized_at: 1700000200,
      }),
    });
    const evaluation = await getEvaluation(client, "1");
    expect(evaluation?.score).toBe(85);
    expect(evaluation?.decision).toBe("APPROVE");
    expect(evaluation?.requirementResults).toHaveLength(2);
    expect(evaluation?.requirementResults[0]).toEqual({ requirementId: 1, status: "PASS", reason: "Looks good." });
  });

  it("propagates a genuine RPC failure without misclassifying it as not-found", async () => {
    const client = mockClient({ readContract: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    await expect(getEvaluation(client, "1")).rejects.toThrow("Failed to fetch");
  });
});

describe("state-machine action predicates (canAcceptMilestone / canTriggerEvaluation / canReleasePayment / canRefundClient)", () => {
  const FREELANCER = "0x1234567890abcdef1234567890abcdef12345678";

  it("canAcceptMilestone requires FUNDED state and the assigned freelancer's wallet", () => {
    expect(canAcceptMilestone({ freelancer: FREELANCER, state: "FUNDED" }, FREELANCER)).toBe(true);
    expect(canAcceptMilestone({ freelancer: FREELANCER, state: "FUNDED" }, FREELANCER.toUpperCase())).toBe(true);
    expect(canAcceptMilestone({ freelancer: FREELANCER, state: "CREATED" }, FREELANCER)).toBe(false);
    expect(canAcceptMilestone({ freelancer: FREELANCER, state: "FUNDED" }, "0xdead")).toBe(false);
    expect(canAcceptMilestone({ freelancer: FREELANCER, state: "FUNDED" }, null)).toBe(false);
  });

  it("canTriggerEvaluation only requires SUBMITTED state — it's permissionless", () => {
    expect(canTriggerEvaluation({ state: "SUBMITTED" })).toBe(true);
    expect(canTriggerEvaluation({ state: "ACCEPTED" })).toBe(false);
    expect(canTriggerEvaluation({ state: "EVALUATING" })).toBe(false);
  });

  it("canReleasePayment requires APPROVED and not yet paid", () => {
    expect(canReleasePayment({ state: "APPROVED", paid: false })).toBe(true);
    expect(canReleasePayment({ state: "APPROVED", paid: true })).toBe(false);
    expect(canReleasePayment({ state: "RELEASED", paid: true })).toBe(false);
  });

  it("canRefundClient requires REJECTED and not yet refunded", () => {
    expect(canRefundClient({ state: "REJECTED", refunded: false })).toBe(true);
    expect(canRefundClient({ state: "REJECTED", refunded: true })).toBe(false);
    expect(canRefundClient({ state: "REFUNDED", refunded: true })).toBe(false);
  });
});

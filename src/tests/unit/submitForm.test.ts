import { describe, expect, it } from "vitest";
import { MAX_EVIDENCE_ITEMS, checkSubmitEligibility, validateSubmitWorkForm } from "@/lib/genlayer/submitForm";

describe("validateSubmitWorkForm", () => {
  const BASE = { deployedUrl: "", repositoryUrl: "", evidenceUrls: [], description: "" };

  it("requires at least a deployed URL or a repository URL", () => {
    expect(validateSubmitWorkForm(BASE)).toMatch(/deployed URL or a repository URL/i);
  });

  it("accepts a valid deployed URL alone", () => {
    expect(validateSubmitWorkForm({ ...BASE, deployedUrl: "https://example.com" })).toBeNull();
  });

  it("accepts a valid repository URL alone", () => {
    expect(validateSubmitWorkForm({ ...BASE, repositoryUrl: "https://github.com/x/y" })).toBeNull();
  });

  it("rejects a malformed deployed URL", () => {
    expect(validateSubmitWorkForm({ ...BASE, deployedUrl: "not-a-url" })).toMatch(/valid http/i);
  });

  it("rejects a non-http(s) protocol", () => {
    expect(validateSubmitWorkForm({ ...BASE, deployedUrl: "ftp://example.com/file" })).toMatch(/valid http/i);
  });

  it("rejects a malformed repository URL", () => {
    expect(validateSubmitWorkForm({ ...BASE, repositoryUrl: "github.com/x/y" })).toMatch(/valid http/i);
  });

  it("accepts multiple valid evidence URLs", () => {
    expect(
      validateSubmitWorkForm({
        ...BASE,
        deployedUrl: "https://example.com",
        evidenceUrls: ["https://example.com/a", "https://example.com/b"],
      }),
    ).toBeNull();
  });

  it("rejects a malformed evidence URL", () => {
    expect(
      validateSubmitWorkForm({ ...BASE, deployedUrl: "https://example.com", evidenceUrls: ["nope"] }),
    ).toMatch(/isn't a valid http/i);
  });

  it(`rejects more than ${MAX_EVIDENCE_ITEMS} evidence URLs`, () => {
    const evidenceUrls = Array.from({ length: MAX_EVIDENCE_ITEMS + 1 }, (_, i) => `https://example.com/${i}`);
    expect(
      validateSubmitWorkForm({ ...BASE, deployedUrl: "https://example.com", evidenceUrls }),
    ).toMatch(new RegExp(`At most ${MAX_EVIDENCE_ITEMS}`));
  });

  it("ignores blank evidence URL slots (unfilled 'add another' rows)", () => {
    expect(
      validateSubmitWorkForm({ ...BASE, deployedUrl: "https://example.com", evidenceUrls: ["", "  "] }),
    ).toBeNull();
  });

  it("rejects a description over the character limit", () => {
    expect(
      validateSubmitWorkForm({ ...BASE, deployedUrl: "https://example.com", description: "x".repeat(2049) }),
    ).toMatch(/at most 2048/i);
  });
});

describe("checkSubmitEligibility", () => {
  const BASE = {
    walletAddress: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    isCorrectNetwork: true,
    milestoneFreelancer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    milestoneState: "ACCEPTED" as const,
    deadlineUnix: Math.floor(Date.now() / 1000) + 3600,
  };

  it("is eligible for the assigned freelancer on an ACCEPTED milestone", () => {
    const result = checkSubmitEligibility(BASE);
    expect(result.eligible).toBe(true);
    expect(result.isResubmission).toBe(false);
  });

  it("is eligible (as a resubmission) when the milestone is already SUBMITTED", () => {
    const result = checkSubmitEligibility({ ...BASE, milestoneState: "SUBMITTED" });
    expect(result.eligible).toBe(true);
    expect(result.isResubmission).toBe(true);
  });

  it("rejects when no wallet is connected", () => {
    const result = checkSubmitEligibility({ ...BASE, walletAddress: null });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/connect your wallet/i);
  });

  it("rejects when the wallet is on the wrong network", () => {
    const result = checkSubmitEligibility({ ...BASE, isCorrectNetwork: false });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/switch to the correct network/i);
  });

  it("rejects a wallet that is not the assigned freelancer", () => {
    const result = checkSubmitEligibility({
      ...BASE,
      walletAddress: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/only the freelancer/i);
  });

  it("rejects a milestone that is not yet ACCEPTED (e.g. still FUNDED)", () => {
    const result = checkSubmitEligibility({ ...BASE, milestoneState: "FUNDED" });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/must be ACCEPTED/i);
  });

  it("rejects a milestone already past evaluation (e.g. APPROVED)", () => {
    const result = checkSubmitEligibility({ ...BASE, milestoneState: "APPROVED" });
    expect(result.eligible).toBe(false);
  });

  it("flags a passed deadline as advisory only — never blocking", () => {
    const result = checkSubmitEligibility({ ...BASE, deadlineUnix: Math.floor(Date.now() / 1000) - 3600 });
    expect(result.eligible).toBe(true);
    expect(result.deadlinePassed).toBe(true);
  });

  it("does not flag a deadline that hasn't passed yet", () => {
    const result = checkSubmitEligibility(BASE);
    expect(result.deadlinePassed).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { validateMilestoneForm, type MilestoneFormInput } from "@/lib/genlayer/milestoneForm";

const VALID_FREELANCER = "0x1234567890abcdef1234567890abcdef12345678";
const VALID_CLIENT = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

function baseInput(overrides: Partial<MilestoneFormInput> = {}): MilestoneFormInput {
  return {
    title: "Landing page",
    description: "Build a landing page.",
    freelancer: VALID_FREELANCER,
    clientAddress: VALID_CLIENT,
    amount: "100",
    deadlineIsoLocal: "2999-01-01T00:00",
    approvalThreshold: "70",
    requirements: [
      { description: "Responsive layout", weight: 50 },
      { description: "Contact form", weight: 50 },
    ],
    nowMs: Date.parse("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("validateMilestoneForm", () => {
  it("accepts a fully valid form", () => {
    expect(validateMilestoneForm(baseInput())).toBeNull();
  });

  it("rejects a missing title", () => {
    expect(validateMilestoneForm(baseInput({ title: "" }))).toMatch(/title/i);
  });

  it("rejects a missing freelancer address", () => {
    expect(validateMilestoneForm(baseInput({ freelancer: "" }))).toMatch(/freelancer/i);
  });

  it("rejects an invalid freelancer address", () => {
    expect(validateMilestoneForm(baseInput({ freelancer: "not-an-address" }))).toMatch(/valid wallet address/i);
  });

  it("rejects the client assigning themselves as freelancer", () => {
    expect(validateMilestoneForm(baseInput({ freelancer: VALID_CLIENT }))).toMatch(/different wallet address/i);
  });

  it("rejects a zero amount", () => {
    expect(validateMilestoneForm(baseInput({ amount: "0" }))).toMatch(/greater than zero/i);
  });

  it("rejects a negative amount", () => {
    expect(validateMilestoneForm(baseInput({ amount: "-5" }))).toMatch(/greater than zero/i);
  });

  it("rejects a non-numeric amount", () => {
    expect(validateMilestoneForm(baseInput({ amount: "abc" }))).toMatch(/greater than zero/i);
  });

  it("rejects a deadline in the past", () => {
    expect(validateMilestoneForm(baseInput({ deadlineIsoLocal: "2020-01-01T00:00" }))).toMatch(/future/i);
  });

  it("rejects a missing deadline", () => {
    expect(validateMilestoneForm(baseInput({ deadlineIsoLocal: "" }))).toMatch(/deadline/i);
  });

  it("rejects an out-of-range approval threshold", () => {
    expect(validateMilestoneForm(baseInput({ approvalThreshold: "0" }))).toMatch(/approval threshold/i);
    expect(validateMilestoneForm(baseInput({ approvalThreshold: "101" }))).toMatch(/approval threshold/i);
  });

  it("rejects an empty requirement description", () => {
    const result = validateMilestoneForm(
      baseInput({ requirements: [{ description: "", weight: 100 }] }),
    );
    expect(result).toMatch(/description/i);
  });

  it("rejects requirement weights that don't sum to 100", () => {
    const result = validateMilestoneForm(
      baseInput({
        requirements: [
          { description: "A", weight: 30 },
          { description: "B", weight: 30 },
        ],
      }),
    );
    expect(result).toMatch(/sum to 100/i);
  });

  it("rejects an out-of-range individual requirement weight", () => {
    const result = validateMilestoneForm(
      baseInput({ requirements: [{ description: "A", weight: 150 }] }),
    );
    expect(result).toMatch(/whole number between 1 and 100/i);
  });

  it("rejects zero requirements", () => {
    expect(validateMilestoneForm(baseInput({ requirements: [] }))).toMatch(/at least one requirement/i);
  });
});

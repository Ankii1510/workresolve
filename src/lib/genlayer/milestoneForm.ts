/**
 * Pure milestone-creation form validation — extracted from
 * src/app/milestones/new/page.tsx so it's unit-testable without rendering
 * the page (see src/tests/unit/milestoneForm.test.ts). This is UX-only
 * validation; the contract re-validates everything itself
 * (create_milestone in contracts/workresolve.py) — see docs/frontend.md
 * "Security": frontend validation is never a substitute for on-chain
 * checks.
 */
import { isValidWalletAddress } from "./milestone";
import { requirementWeightsSumTo100 } from "./canonical";

export interface MilestoneFormRequirement {
  description: string;
  weight: number;
}

export interface MilestoneFormInput {
  title: string;
  description: string;
  freelancer: string;
  clientAddress: string | null; // the connected wallet's own address, to reject self-assignment
  amount: string;
  deadlineIsoLocal: string; // value from an <input type="datetime-local">
  approvalThreshold: string;
  requirements: MilestoneFormRequirement[];
  nowMs?: number; // injectable for deterministic tests; defaults to Date.now()
}

export function validateMilestoneForm(input: MilestoneFormInput): string | null {
  const now = input.nowMs ?? Date.now();

  if (!input.title.trim()) return "Project title is required.";
  if (!input.description.trim()) return "Description is required.";
  if (!input.freelancer.trim()) return "Freelancer wallet address is required.";
  if (!isValidWalletAddress(input.freelancer.trim())) {
    return `"${input.freelancer.trim()}" doesn't look like a valid wallet address (expected 0x + 40 hex characters).`;
  }
  if (input.clientAddress && input.freelancer.trim().toLowerCase() === input.clientAddress.toLowerCase()) {
    return "The freelancer must be a different wallet address than the client (you).";
  }

  const amountNum = Number(input.amount);
  if (!input.amount.trim() || Number.isNaN(amountNum) || amountNum <= 0) {
    return "Amount must be a number greater than zero.";
  }

  if (!input.deadlineIsoLocal) return "Deadline is required.";
  const deadlineMs = new Date(input.deadlineIsoLocal).getTime();
  if (Number.isNaN(deadlineMs) || deadlineMs <= now) {
    return "Deadline must be a valid date/time in the future.";
  }

  const thresholdNum = Number(input.approvalThreshold);
  if (!Number.isInteger(thresholdNum) || thresholdNum < 1 || thresholdNum > 100) {
    return "Approval threshold must be a whole number between 1 and 100.";
  }

  if (input.requirements.length === 0) return "At least one requirement is required.";
  if (input.requirements.some((r) => !r.description.trim())) return "Every requirement needs a description.";

  const weights = input.requirements.map((r) => Number(r.weight));
  if (weights.some((w) => !Number.isInteger(w) || w < 1 || w > 100)) {
    return "Each requirement weight must be a whole number between 1 and 100.";
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (
    !requirementWeightsSumTo100(
      input.requirements.map((r, i) => ({ id: i + 1, description: r.description, weight: Number(r.weight) })),
    )
  ) {
    return `Requirement weights must sum to 100 (currently ${totalWeight}).`;
  }

  return null;
}

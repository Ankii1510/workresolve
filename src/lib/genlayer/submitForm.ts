/**
 * Pure freelancer-submission form validation + access-eligibility checks
 * (Phase 6) — extracted from SubmitWorkView so both are unit-testable
 * without rendering the page, same pattern as milestoneForm.ts.
 *
 * As with every other frontend validator in this app, this is UX-only.
 * contracts/workresolve.py's submit_work() re-checks the freelancer-only and
 * state guards itself and is the authoritative source of truth — see
 * docs/frontend.md "Security". The one check here the contract does NOT
 * also enforce is the deadline: submit_work() has no deadline guard at all,
 * so `checkSubmitEligibility` reports a passed deadline as a *warning*
 * (`deadlinePassed: true`), not a blocking condition — blocking a
 * submission the contract would actually accept would be a real UX bug, not
 * a safety feature. See docs/evaluation.md "Freelancer Submission".
 */
import type { MilestoneState } from "@/types";

/** Mirrors contracts/workresolve.py's MAX_EVIDENCE_ITEMS. */
export const MAX_EVIDENCE_ITEMS = 10;
/** Mirrors contracts/workresolve.py's MAX_DESCRIPTION_LEN, reused for the
 * submission's freelancer-notes field (the contract applies the same limit
 * to Submission.description as it does to Milestone.description). */
export const MAX_SUBMISSION_DESCRIPTION_LEN = 2048;

export interface SubmitWorkFormInput {
  deployedUrl: string;
  repositoryUrl: string;
  evidenceUrls: string[];
  description: string;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Validates the submission form's field shapes. Returns a single
 * user-facing error string, or null when the form is ready to review. */
export function validateSubmitWorkForm(input: SubmitWorkFormInput): string | null {
  const deployedUrl = input.deployedUrl.trim();
  const repositoryUrl = input.repositoryUrl.trim();

  if (!deployedUrl && !repositoryUrl) {
    return "Provide at least a deployed URL or a repository URL.";
  }
  if (deployedUrl && !isHttpUrl(deployedUrl)) {
    return "Deployed URL must be a valid http(s) URL.";
  }
  if (repositoryUrl && !isHttpUrl(repositoryUrl)) {
    return "Repository URL must be a valid http(s) URL.";
  }

  const evidenceUrls = input.evidenceUrls.map((u) => u.trim()).filter(Boolean);
  if (evidenceUrls.length > MAX_EVIDENCE_ITEMS) {
    return `At most ${MAX_EVIDENCE_ITEMS} evidence URLs are allowed.`;
  }
  for (const url of evidenceUrls) {
    if (!isHttpUrl(url)) return `"${url}" isn't a valid http(s) URL.`;
  }

  if (input.description.length > MAX_SUBMISSION_DESCRIPTION_LEN) {
    return `Notes for the evaluator must be at most ${MAX_SUBMISSION_DESCRIPTION_LEN} characters.`;
  }

  return null;
}

export interface SubmitEligibility {
  eligible: boolean;
  reason: string | null;
  /** True when a submission already exists and this would overwrite it —
   * the contract allows this (see contracts/workresolve.py submit_work's
   * `_require_state(milestone, "ACCEPTED", "SUBMITTED")`) any number of
   * times up until evaluate_and_finalize is called. */
  isResubmission: boolean;
  /** Advisory only — see the module docstring. */
  deadlinePassed: boolean;
}

export function checkSubmitEligibility(params: {
  walletAddress: string | null;
  isCorrectNetwork: boolean;
  milestoneFreelancer: string;
  milestoneState: MilestoneState;
  deadlineUnix: number;
  nowMs?: number;
}): SubmitEligibility {
  const now = params.nowMs ?? Date.now();
  const deadlinePassed = params.deadlineUnix > 0 && now / 1000 > params.deadlineUnix;
  const isResubmission = params.milestoneState === "SUBMITTED";

  if (!params.walletAddress) {
    return { eligible: false, reason: "Connect your wallet to submit work.", isResubmission, deadlinePassed };
  }
  if (!params.isCorrectNetwork) {
    return {
      eligible: false,
      reason: "Switch to the correct network before submitting work.",
      isResubmission,
      deadlinePassed,
    };
  }
  if (params.walletAddress.toLowerCase() !== params.milestoneFreelancer.toLowerCase()) {
    return {
      eligible: false,
      reason: "Only the freelancer assigned to this milestone can submit work.",
      isResubmission,
      deadlinePassed,
    };
  }
  if (params.milestoneState !== "ACCEPTED" && params.milestoneState !== "SUBMITTED") {
    return {
      eligible: false,
      reason: `This milestone must be ACCEPTED before work can be submitted (it is currently ${params.milestoneState}).`,
      isResubmission,
      deadlinePassed,
    };
  }

  return { eligible: true, reason: null, isResubmission, deadlinePassed };
}

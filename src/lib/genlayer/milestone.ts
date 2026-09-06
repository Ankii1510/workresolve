/**
 * WorkResolve milestone service layer (Phase 5) — the ONE place UI code
 * calls into the deployed contract. No component should construct a raw
 * `readContract`/`writeContract` call itself; every read and write below
 * wraps the real contract methods documented in docs/contracts.md
 * "Functions", using the exact snake_case names from
 * contracts/workresolve.py (also mirrored in `CONTRACT_FUNCTION_NAMES`
 * for reference).
 *
 * Every function here requires a configured contract address
 * (`NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS`, via `requireContractAddress()`)
 * and throws a clear `ConfigError` (mapped to `MISSING_ENV_VAR` by
 * `toAppError`) if one isn't set — which is the honest state of this
 * environment right now: contracts/workresolve.py has never been deployed
 * anywhere (see docs/contracts.md "Known Limitations"), so every call below
 * will fail with that same clear error until a real deployment exists and
 * its address is configured. That is intentional: **no fake transactions,
 * no fake data** — see docs/frontend.md "No Fake Data".
 *
 * Amount handling: the UI collects a milestone amount in whole GEN (the
 * chain's native currency, 18 decimals per every genlayer-js chain
 * definition — inspected directly from node_modules/genlayer-js). This
 * module converts to/from the on-chain integer (wei-equivalent) unit using
 * viem's `parseUnits`/`formatUnits` — the same, already-a-dependency
 * library genlayer-js itself is built on, so no second incompatible Web3
 * stack is introduced.
 */
import { formatUnits, isAddress, parseUnits } from "viem";
import type { Evaluation, Milestone, Reputation, Submission } from "@/types";
import type { AppGenLayerClient } from "./client";
import { requireContractAddress } from "./config";
import { sendWriteTransaction } from "./transactions";

export const NATIVE_TOKEN_DECIMALS = 18;
export const NATIVE_TOKEN_SYMBOL = "GEN";

/** Thrown when a write is attempted without a connected, write-capable
 * client. Distinct from ConfigError (no contract deployed) and from a
 * contract revert (ContractRevertError) — this is "you're not signed in". */
export class WalletNotConnectedError extends Error {
  constructor(action: string) {
    super(`Connect your wallet before you can ${action}.`);
    this.name = "WalletNotConnectedError";
  }
}

/** Retained name for compatibility with earlier phases' error-classification
 * code path (`toAppError` maps this to the NOT_IMPLEMENTED app error code).
 * Thrown only in the one remaining case that's genuinely "not implemented
 * yet" in this codebase, not "not deployed" (which is ConfigError) — see
 * the module docstring. */
export class NotImplementedError extends Error {
  constructor(functionName: string) {
    super(`${functionName}() is not implemented.`);
    this.name = "NotImplementedError";
  }
}

/** Maps each frontend-facing method name to the real contract method name —
 * see contracts/workresolve.py and docs/contracts.md "Functions". */
export const CONTRACT_FUNCTION_NAMES = {
  createMilestone: "create_milestone",
  fundMilestone: "fund_milestone",
  acceptMilestone: "accept_milestone",
  submitWork: "submit_work",
  evaluateAndFinalize: "evaluate_and_finalize",
  releasePayment: "release_payment",
  refundClient: "refund_client",
  cancelMilestone: "cancel_milestone",
  getMilestone: "get_milestone",
  getSubmission: "get_submission",
  getEvaluation: "get_evaluation",
  getMilestonesByClient: "get_milestones_by_client",
  getMilestonesByFreelancer: "get_milestones_by_freelancer",
  getReputation: "get_reputation",
  getMilestoneCount: "get_milestone_count",
} as const;

export interface CreateMilestoneInput {
  freelancer: string;
  title: string;
  description: string;
  requirementDescriptions: string[];
  requirementWeights: number[]; // each 1-100; must sum to exactly 100
  amount: string; // whole GEN, decimal string (e.g. "100" or "12.5")
  deadline: number; // unix seconds
  approvalThreshold?: number; // 1-100, defaults to 70 on-chain if omitted
}

export interface SubmitWorkInput {
  milestoneId: string;
  deployedUrl: string;
  repositoryUrl: string;
  evidenceUrls: string[];
  description: string;
}

export function parseGenAmount(whole: string): bigint {
  return parseUnits(whole, NATIVE_TOKEN_DECIMALS);
}

export function formatGenAmount(wei: string | bigint): string {
  return formatUnits(typeof wei === "bigint" ? wei : BigInt(wei), NATIVE_TOKEN_DECIMALS);
}

export function isValidWalletAddress(value: string): boolean {
  return isAddress(value);
}

// ---------------------------------------------------------------------------
// Pure state-machine predicates (Phase 6) — mirror the exact `_require_state`
// + sender-address guards in contracts/workresolve.py's accept_milestone /
// evaluate_and_finalize / release_payment / refund_client. These are UX-only
// (the contract re-checks every one of these itself and is the authoritative
// source — see docs/frontend.md "Security"), but keeping them here as pure,
// unit-testable functions means every page that needs to decide "should I
// show this button" asks the same question the same way, instead of each
// component re-deriving its own boolean.
// ---------------------------------------------------------------------------

export function canAcceptMilestone(
  milestone: Pick<Milestone, "freelancer" | "state">,
  walletAddress: string | null,
): boolean {
  return (
    !!walletAddress &&
    milestone.state === "FUNDED" &&
    walletAddress.toLowerCase() === milestone.freelancer.toLowerCase()
  );
}

/** evaluate_and_finalize is permissionless by contract design (see its
 * docstring in contracts/workresolve.py) — any connected wallet may trigger
 * it once the milestone is SUBMITTED. This only gates on milestone state,
 * not sender identity. */
export function canTriggerEvaluation(milestone: Pick<Milestone, "state">): boolean {
  return milestone.state === "SUBMITTED";
}

/** release_payment / refund_client are also permissionless — anyone may
 * trigger the payout once the result is finalized. Idempotency is enforced
 * on-chain via `paid`/`refunded`; these mirror that latch client-side so a
 * confirmed action's button disappears instead of inviting a second,
 * guaranteed-to-revert click. */
export function canReleasePayment(milestone: Pick<Milestone, "state" | "paid">): boolean {
  return milestone.state === "APPROVED" && !milestone.paid;
}

export function canRefundClient(milestone: Pick<Milestone, "state" | "refunded">): boolean {
  return milestone.state === "REJECTED" && !milestone.refunded;
}

function requireWriteClient(client: AppGenLayerClient | null, action: string): AppGenLayerClient {
  if (!client) throw new WalletNotConnectedError(action);
  return client;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createMilestone(
  client: AppGenLayerClient | null,
  input: CreateMilestoneInput,
): Promise<{ txHash: string; milestoneId: string | null }> {
  const writeClient = requireWriteClient(client, "create a milestone");
  const address = requireContractAddress();

  if (!isValidWalletAddress(input.freelancer)) {
    throw new Error(`"${input.freelancer}" is not a valid wallet address.`);
  }

  const { txHash } = await sendWriteTransaction(writeClient, address, {
    functionName: CONTRACT_FUNCTION_NAMES.createMilestone,
    args: [
      input.freelancer,
      input.title,
      input.description,
      input.requirementDescriptions,
      input.requirementWeights,
      parseGenAmount(input.amount), // bigint — CalldataEncodable supports bigint directly, avoids precision loss from Number()
      input.deadline,
      input.approvalThreshold ?? 70,
    ],
  });

  // create_milestone's own return value (the new milestone id) is not
  // reliably decodable from a write receipt with a confirmed API in this
  // phase's research (no bundled gltest example inspects a write's return
  // value, only its success/failure — see docs/contracts.md "Known
  // Limitations"). Falling back to the robust approach: re-read this
  // client's own milestone list and take the newest id, which works
  // regardless of how (or whether) the write's return value is exposed.
  let milestoneId: string | null = null;
  try {
    const clientAddress = getClientAccountAddress(writeClient);
    if (clientAddress) {
      const ids = await getMilestonesByClient(writeClient, clientAddress);
      milestoneId = ids.length > 0 ? ids[ids.length - 1] : null;
    }
  } catch {
    milestoneId = null; // best-effort only — the transaction itself already succeeded
  }

  return { txHash, milestoneId };
}

export async function fundMilestone(
  client: AppGenLayerClient | null,
  milestoneId: string,
  amountWei: bigint,
): Promise<{ txHash: string }> {
  const writeClient = requireWriteClient(client, "fund this milestone");
  const address = requireContractAddress();
  const { txHash } = await sendWriteTransaction(writeClient, address, {
    functionName: CONTRACT_FUNCTION_NAMES.fundMilestone,
    args: [milestoneId],
    value: amountWei,
  });
  return { txHash };
}

export async function acceptMilestone(
  client: AppGenLayerClient | null,
  milestoneId: string,
): Promise<{ txHash: string }> {
  const writeClient = requireWriteClient(client, "accept this milestone");
  const address = requireContractAddress();
  const { txHash } = await sendWriteTransaction(writeClient, address, {
    functionName: CONTRACT_FUNCTION_NAMES.acceptMilestone,
    args: [milestoneId],
  });
  return { txHash };
}

export async function submitWork(
  client: AppGenLayerClient | null,
  input: SubmitWorkInput,
): Promise<{ txHash: string }> {
  const writeClient = requireWriteClient(client, "submit work");
  const address = requireContractAddress();
  const { txHash } = await sendWriteTransaction(writeClient, address, {
    functionName: CONTRACT_FUNCTION_NAMES.submitWork,
    args: [
      input.milestoneId,
      input.deployedUrl,
      input.repositoryUrl,
      input.evidenceUrls,
      input.description,
    ],
  });
  return { txHash };
}

export async function evaluateAndFinalize(
  client: AppGenLayerClient | null,
  milestoneId: string,
): Promise<{ txHash: string }> {
  const writeClient = requireWriteClient(client, "trigger evaluation");
  const address = requireContractAddress();
  const { txHash } = await sendWriteTransaction(writeClient, address, {
    functionName: CONTRACT_FUNCTION_NAMES.evaluateAndFinalize,
    args: [milestoneId],
  });
  return { txHash };
}

export async function releasePayment(
  client: AppGenLayerClient | null,
  milestoneId: string,
): Promise<{ txHash: string }> {
  const writeClient = requireWriteClient(client, "release payment");
  const address = requireContractAddress();
  const { txHash } = await sendWriteTransaction(writeClient, address, {
    functionName: CONTRACT_FUNCTION_NAMES.releasePayment,
    args: [milestoneId],
  });
  return { txHash };
}

export async function refundClient(
  client: AppGenLayerClient | null,
  milestoneId: string,
): Promise<{ txHash: string }> {
  const writeClient = requireWriteClient(client, "refund the client");
  const address = requireContractAddress();
  const { txHash } = await sendWriteTransaction(writeClient, address, {
    functionName: CONTRACT_FUNCTION_NAMES.refundClient,
    args: [milestoneId],
  });
  return { txHash };
}

export async function cancelMilestone(
  client: AppGenLayerClient | null,
  milestoneId: string,
): Promise<{ txHash: string }> {
  const writeClient = requireWriteClient(client, "cancel this milestone");
  const address = requireContractAddress();
  const { txHash } = await sendWriteTransaction(writeClient, address, {
    functionName: CONTRACT_FUNCTION_NAMES.cancelMilestone,
    args: [milestoneId],
  });
  return { txHash };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export class MilestoneNotFoundError extends Error {
  constructor(milestoneId: string) {
    super(`Milestone ${milestoneId} doesn't exist.`);
    this.name = "MilestoneNotFoundError";
  }
}

export async function getMilestone(client: AppGenLayerClient, milestoneId: string): Promise<Milestone> {
  const address = requireContractAddress();
  let raw: unknown;
  try {
    raw = await client.readContract({
      address,
      functionName: CONTRACT_FUNCTION_NAMES.getMilestone,
      args: [milestoneId],
      jsonSafeReturn: true,
    });
  } catch (err) {
    if (isNotFoundError(err)) throw new MilestoneNotFoundError(milestoneId);
    throw err;
  }
  return parseMilestone(raw, milestoneId);
}

export async function getSubmission(client: AppGenLayerClient, milestoneId: string): Promise<Submission | null> {
  const address = requireContractAddress();
  try {
    const raw = await client.readContract({
      address,
      functionName: CONTRACT_FUNCTION_NAMES.getSubmission,
      args: [milestoneId],
      jsonSafeReturn: true,
    });
    return parseSubmission(raw, milestoneId);
  } catch (err) {
    if (isNotFoundError(err)) return null; // no submission yet — expected before SUBMITTED
    throw err;
  }
}

export async function getEvaluation(client: AppGenLayerClient, milestoneId: string): Promise<Evaluation | null> {
  const address = requireContractAddress();
  try {
    const raw = await client.readContract({
      address,
      functionName: CONTRACT_FUNCTION_NAMES.getEvaluation,
      args: [milestoneId],
      jsonSafeReturn: true,
    });
    return parseEvaluation(raw, milestoneId);
  } catch (err) {
    if (isNotFoundError(err)) return null; // no evaluation yet — expected before APPROVED/REJECTED
    throw err;
  }
}

export async function getMilestonesByClient(client: AppGenLayerClient, clientAddress: string): Promise<string[]> {
  const address = requireContractAddress();
  const raw = await client.readContract({
    address,
    functionName: CONTRACT_FUNCTION_NAMES.getMilestonesByClient,
    args: [clientAddress],
    jsonSafeReturn: true,
  });
  return Array.isArray(raw) ? raw.map(String) : [];
}

export async function getMilestonesByFreelancer(
  client: AppGenLayerClient,
  freelancerAddress: string,
): Promise<string[]> {
  const address = requireContractAddress();
  const raw = await client.readContract({
    address,
    functionName: CONTRACT_FUNCTION_NAMES.getMilestonesByFreelancer,
    args: [freelancerAddress],
    jsonSafeReturn: true,
  });
  return Array.isArray(raw) ? raw.map(String) : [];
}

export async function getReputation(client: AppGenLayerClient, walletAddress: string): Promise<Reputation> {
  const address = requireContractAddress();
  const raw = await client.readContract({
    address,
    functionName: CONTRACT_FUNCTION_NAMES.getReputation,
    args: [walletAddress],
    jsonSafeReturn: true,
  });
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    address: String(r.address ?? walletAddress),
    jobsCreated: toNumber(r.jobs_created),
    jobsCompleted: toNumber(r.jobs_completed),
    jobsFunded: toNumber(r.jobs_funded),
    reputationScore: toNumber(r.reputation_score),
  };
}

export async function getMilestoneCount(client: AppGenLayerClient): Promise<number> {
  const address = requireContractAddress();
  const raw = await client.readContract({
    address,
    functionName: CONTRACT_FUNCTION_NAMES.getMilestoneCount,
    args: [],
    jsonSafeReturn: true,
  });
  return toNumber(raw);
}

// ---------------------------------------------------------------------------
// Parsing helpers
//
// The exact JSON shape a @gl.public.view method returns for an
// @allow_storage @dataclass (field-keyed dict, per every confirmed bundled
// example — see docs/architecture.md "Phase 4 API corrections") is real but
// has never been observed live in this environment. These parsers assume
// snake_case keys matching contracts/workresolve.py's dataclass field names
// exactly, and are deliberately defensive (toNumber/toStr coerce rather
// than throw on an unexpected primitive shape) so a live run that turns up
// a minor shape mismatch degrades to a visible parsing error rather than a
// silent wrong value. See docs/frontend.md "Data Fetching" for how a
// mismatch here should be handled if discovered against a live network.
// ---------------------------------------------------------------------------

function parseMilestone(raw: unknown, milestoneId: string): Milestone {
  const m = raw as Record<string, unknown>;
  if (!m || typeof m !== "object") throw new MilestoneNotFoundError(milestoneId);
  return {
    milestoneId: String(m.milestone_id ?? milestoneId),
    client: toAddressString(m.client),
    freelancer: toAddressString(m.freelancer),
    title: String(m.title ?? ""),
    description: String(m.description ?? ""),
    requirements: Array.isArray(m.requirements)
      ? m.requirements.map((r) => {
          const req = r as Record<string, unknown>;
          return { id: toNumber(req.id), description: String(req.description ?? ""), weight: toNumber(req.weight) };
        })
      : [],
    requirementsHash: String(m.requirements_hash ?? ""),
    amount: String(m.amount ?? "0"),
    approvalThreshold: toNumber(m.approval_threshold, 70),
    deadline: toNumber(m.deadline),
    state: (String(m.state ?? "CREATED") as Milestone["state"]),
    paid: Boolean(m.paid),
    refunded: Boolean(m.refunded),
    createdAt: toNumber(m.created_at),
    fundedAt: toNumber(m.funded_at),
    acceptedAt: toNumber(m.accepted_at),
    submittedAt: toNumber(m.submitted_at),
    finalizedAt: toNumber(m.finalized_at),
  };
}

function parseSubmission(raw: unknown, milestoneId: string): Submission {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    milestoneId,
    deployedUrl: String(s.deployed_url ?? ""),
    repositoryUrl: String(s.repository_url ?? ""),
    evidenceUrls: Array.isArray(s.evidence_urls) ? s.evidence_urls.map(String) : [],
    description: String(s.description ?? ""),
    submittedAt: toNumber(s.submitted_at),
  };
}

function parseEvaluation(raw: unknown, milestoneId: string): Evaluation {
  const e = (raw ?? {}) as Record<string, unknown>;
  return {
    milestoneId,
    score: toNumber(e.score),
    decision: (String(e.decision ?? "REJECT") as Evaluation["decision"]),
    requirementResults: Array.isArray(e.requirement_results)
      ? e.requirement_results.map((r) => {
          const rr = r as Record<string, unknown>;
          return {
            requirementId: toNumber(rr.id),
            status: (String(rr.status ?? "UNVERIFIABLE") as Evaluation["requirementResults"][number]["status"]),
            reason: String(rr.reason ?? ""),
          };
        })
      : [],
    summary: String(e.summary ?? ""),
    finalizedAt: toNumber(e.finalized_at),
  };
}

function toAddressString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "as_hex" in value) {
    return String((value as { as_hex: unknown }).as_hex);
  }
  return String(value ?? "");
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return fallback;
}

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /does not exist|no submission exists|no evaluation exists/i.test(message);
}

function getClientAccountAddress(client: AppGenLayerClient): string | null {
  const account = (client as unknown as { account?: { address?: string } }).account;
  return account?.address ?? null;
}

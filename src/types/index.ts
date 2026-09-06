/**
 * Canonical application types for WorkResolve.
 *
 * These mirror the on-chain data model defined in Phase 2 of the architecture
 * (docs/architecture.md, section 5). Every field is annotated below with
 * where it lives and whether it is mutable, so this file stays the single
 * source of truth consumed by hooks, components, and (later) the contract
 * interaction layer — no page or component should redeclare its own version
 * of these shapes.
 *
 * NOTE (Phase 3 status): the Intelligent Contract does not exist yet
 * (that's Phase 4). These types describe the *target* on-chain shape so the
 * frontend, hooks, and blockchain abstraction layer can be built against a
 * stable contract before the contract itself is written.
 */

/** Milestone lifecycle state machine — see docs/architecture.md section 3. */
export type MilestoneState =
  | "CREATED"
  | "FUNDED"
  | "ACCEPTED"
  | "SUBMITTED"
  | "EVALUATING"
  | "APPROVED"
  | "REJECTED"
  | "RELEASED"
  | "REFUNDED"
  | "CANCELLED";

/** Per-requirement evaluation verdict. Never PASS-by-default on ambiguity. */
export type RequirementStatus = "PASS" | "FAIL" | "PARTIAL" | "UNVERIFIABLE";

/** Deterministic financial outcome derived from the finalized evaluation score. */
export type EvaluationDecision = "APPROVE" | "REJECT";

/**
 * A single structured requirement.
 * On-chain / immutable once the milestone reaches FUNDED (see architecture
 * section 6 — requirements have no mutator function after creation).
 */
export interface Requirement {
  id: number;
  description: string; // max 500 chars, enforced client-side and contract-side
  weight: number; // 1-100; all requirement weights for a milestone must sum to 100
}

/** Input shape used only while building a milestone in the Create Milestone form. */
export type RequirementInput = Omit<Requirement, "id"> & { id?: number };

/**
 * The core escrow entity. On-chain, mostly immutable — only `state`, `paid`,
 * and `refunded` mutate after creation, and only through the guarded
 * contract methods described in docs/architecture.md section 4.
 */
export interface Milestone {
  milestoneId: string; // on-chain, immutable (u256 as decimal string)
  client: string; // on-chain, immutable (wallet address)
  freelancer: string; // on-chain, immutable once set at creation
  title: string; // on-chain, immutable, max 200 chars
  description: string; // on-chain, immutable, max 2048 chars
  requirements: Requirement[]; // on-chain, immutable once FUNDED
  requirementsHash: string; // on-chain, immutable — commitment hash, see architecture section 6
  amount: string; // on-chain, immutable (native token units, decimal string)
  approvalThreshold: number; // on-chain, immutable, 1-100 — see contracts/workresolve.py create_milestone
  deadline: number; // on-chain, immutable (unix seconds)
  state: MilestoneState; // on-chain, mutable
  paid: boolean; // on-chain, mutable (false -> true once)
  refunded: boolean; // on-chain, mutable (false -> true once)
  // Real field names/shape from contracts/workresolve.py's Milestone struct
  // (Phase 4) — each is 0 until the corresponding transition happens; see
  // docs/frontend.md "Timeline" for how these back the detail page's
  // timeline instead of a synthetic event log.
  createdAt: number; // on-chain, immutable (unix seconds)
  fundedAt: number; // on-chain, 0 until FUNDED
  acceptedAt: number; // on-chain, 0 until ACCEPTED
  submittedAt: number; // on-chain, 0 until SUBMITTED (updated again on resubmission)
  finalizedAt: number; // on-chain, 0 until APPROVED/REJECTED
}

/**
 * Freelancer's submitted evidence for a milestone.
 * On-chain, mutable only while state === "SUBMITTED" (resubmission overwrites).
 */
export interface Submission {
  milestoneId: string; // on-chain, required
  deployedUrl: string; // on-chain, mutable, optional* (see repositoryUrl)
  repositoryUrl: string; // on-chain, mutable, optional* — one of the two URLs is required
  // Real contract field is `evidence_urls: list[str]` (contracts/workresolve.py)
  // — plain URLs, not specifically IPFS CIDs. Renamed from Phase 3's
  // `evidenceCids` to match; see docs/architecture.md "Phase 4 API
  // corrections" and docs/frontend.md.
  evidenceUrls: string[]; // on-chain, mutable, optional
  description: string; // on-chain, mutable, optional, max 2048 chars
  submittedAt: number; // on-chain, mutable (updated on resubmit)
}

/**
 * Off-chain / app-layer description of an uploaded evidence file, before and
 * after IPFS pinning. Only `cid` (once set) ever reaches the contract.
 */
export interface Evidence {
  cid: string | null; // off-chain until pinned; the CID itself becomes on-chain data once submitted
  filename: string; // off-chain only
  mimeType: string; // off-chain only
  sizeBytes: number; // off-chain only
  uploadedAt: number | null; // off-chain only
}

/** One requirement's finalized verdict, part of the write-once Evaluation.
 * NOTE: the real contract's RequirementResult struct (contracts/workresolve.py)
 * stores only `id`, `status`, `reason` — no per-requirement `score` field.
 * The overall points-per-status math (PASS=weight, PARTIAL=weight/2,
 * FAIL/UNVERIFIABLE=0) is deterministic and can be recomputed client-side
 * from `status` + the requirement's `weight` if a UI wants to show it; it is
 * not itself stored on-chain per requirement. See docs/contracts.md
 * "Consensus Result". */
export interface RequirementResult {
  requirementId: number; // on-chain, immutable once finalized
  status: RequirementStatus; // on-chain, immutable
  reason: string; // on-chain, immutable, max 300 chars — concise, never chain-of-thought
}

/**
 * The finalized, consensus-produced evaluation result. Write-once: no
 * contract method may modify this after `evaluateAndFinalize` succeeds.
 */
export interface Evaluation {
  milestoneId: string; // on-chain, immutable
  score: number; // on-chain, immutable, 0-100
  decision: EvaluationDecision; // on-chain, immutable
  requirementResults: RequirementResult[]; // on-chain, immutable
  summary: string; // on-chain, immutable, max 500 chars
  finalizedAt: number; // on-chain, immutable (unix seconds)
}

/** Objective, event-driven reputation counters — never derived from AI score. */
export interface Reputation {
  address: string; // on-chain
  jobsCreated: number; // on-chain, monotonically increasing
  jobsCompleted: number; // on-chain, monotonically increasing (freelancer, on RELEASED)
  jobsFunded: number; // on-chain, monotonically increasing (client, on RELEASED or REFUNDED)
  reputationScore: number; // on-chain, monotonically increasing
}

/** Off-chain, derived view of a connected participant. Not a stored entity. */
export interface User {
  walletAddress: string; // derived from wallet connection
  displayName?: string; // off-chain only, cosmetic, local to the browser session
  reputation: Reputation | null; // fetched live; null until loaded
}

/** Legacy/optional grouping label. NOT a separate on-chain entity for MVP
 * (see docs/architecture.md section 18 — Project-as-entity is FUTURE scope).
 * Kept as a type so a later phase can promote it without breaking imports. */
export interface Project {
  projectId: string;
  client: string;
  title: string;
  milestoneIds: string[];
  createdAt: number;
}

/** Every contract-write action the app can perform, used to key transaction UX. */
export type ContractAction =
  | "createMilestone"
  | "fundMilestone"
  | "acceptMilestone"
  | "submitWork"
  | "evaluateAndFinalize"
  | "releasePayment"
  | "refundClient"
  | "cancelMilestone";

/** UI-facing lifecycle for a single blockchain transaction, shared by every write hook. */
export type TransactionStatus =
  "IDLE" | "WAITING_FOR_SIGNATURE" | "SUBMITTING" | "CONFIRMING" | "SUCCESS" | "FAILED";

/** App-layer wrapper around one transaction's lifecycle. Never persisted. */
export interface TransactionState {
  action: ContractAction | null;
  status: TransactionStatus;
  hash: string | null;
  error: AppError | null;
}

/** Standardized error categories — see docs/architecture.md section 16 / 14. */
export type AppErrorCode =
  | "WALLET_NOT_CONNECTED"
  | "WRONG_NETWORK"
  | "USER_REJECTED"
  | "UNSUPPORTED_WALLET"
  | "INSUFFICIENT_BALANCE"
  | "INVALID_ADDRESS"
  | "INVALID_INPUT"
  | "INVALID_STATE"
  | "MILESTONE_NOT_FOUND"
  | "TRANSACTION_FAILED"
  | "TRANSACTION_TIMEOUT"
  | "CONTRACT_ERROR"
  | "RPC_ERROR"
  | "MISSING_ENV_VAR"
  | "GENLAYER_UNAVAILABLE"
  | "NOT_IMPLEMENTED"
  | "UNKNOWN";

/** Explicit wallet connection state machine — see docs/frontend.md "Wallet
 * Architecture". Derived from useWallet()'s lower-level flags so both the
 * UI and tests can switch on one value instead of re-deriving it. */
export type WalletConnectionStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "WRONG_NETWORK"
  | "ERROR";

export interface AppError {
  code: AppErrorCode;
  message: string; // user-safe, understandable message
  cause?: unknown; // raw error, only ever logged in development
}

# GenLayer Integration

## Why GenLayer?

WorkResolve's core problem is deciding whether a freelancer's delivered work actually satisfies a
set of requirements agreed on before the work started — "does this deployed website have a
responsive layout," "does this repository contain a working contact form." That's a judgment call
about unstructured, real-world content (a live URL, a GitHub repository, free-text evidence), not a
comparison of two numbers or two hashes. A conventional deterministic smart contract can enforce
*that* an agreed process happened (escrow funded, freelancer assigned, deadline set) but has no way
to *read and judge* a webpage or a repository — its execution model is closed: given the same
inputs, every node must compute the exact same output, and "does this page look responsive" isn't a
deterministic function of on-chain state. GenLayer's Intelligent Contracts are the piece that closes
that gap: they let contract code call an LLM and fetch external web content as part of consensus,
while still requiring independent validators to agree on the result before it's accepted.

## What part of WorkResolve requires Intelligent Contract capabilities

Exactly one operation: `evaluate_and_finalize`. Every other contract method (`create_milestone`,
`fund_milestone`, `accept_milestone`, `submit_work`, `release_payment`, `refund_client`,
`cancel_milestone`) is fully deterministic — no LLM call, no external fetch, ordinary EVM-style
logic would do. `evaluate_and_finalize` is the one place WorkResolve needs a non-deterministic,
consensus-backed judgment: given the milestone's original, immutable requirements and the
freelancer's submitted evidence (a URL, a repository, notes), produce a structured
PASS/FAIL/PARTIAL/UNVERIFIABLE verdict per requirement.

## What GenLayer does

- **Requirements evaluation**: `evaluate_and_finalize` reads `milestone.requirements` directly from
  on-chain state — the same immutable set committed at `create_milestone` — never from any
  frontend-supplied value, so the criteria being judged can't be swapped out after the fact (see
  `docs/contracts.md` "Requirement Immutability").
- **External evidence evaluation**: inside a non-deterministic closure, the contract calls
  `gl.get_webpage(url)` for the submitted deployed URL/repository/evidence links and passes the
  fetched content to `gl.exec_prompt(...)`/`gl.eq_principle_prompt_comparative(...)` alongside the
  requirements, under an explicit three-tier prompt hierarchy (system rules → immutable
  requirements → untrusted fetched content) — see `docs/evaluation.md` "Prompt Injection Defense."
  Every submitted URL and every fetched page is treated as untrusted input to be *assessed*, never
  as an instruction to *follow*.
- **Consensus**: GenLayer's validator network independently runs that same non-deterministic step
  and must agree on the same structured JSON result (a status per requirement, plus a short
  explanation) before it is accepted — this is what makes the evaluation a decentralized judgment
  rather than one party's opinion.
- **Finalized result**: once consensus is reached, the validated per-requirement statuses are
  written to on-chain state. GenLayer's job ends there — it does not compute a score, does not make
  the APPROVE/REJECT decision, and does not move any funds.

## What the deterministic contract does

- **Escrow**: `fund_milestone` requires an exact-value transfer matching the agreed `amount`;
  funds sit in the contract until a settlement method runs.
- **State transitions**: the full state machine (`CREATED → FUNDED → ACCEPTED → SUBMITTED →
  APPROVED/REJECTED → RELEASED/REFUNDED`, plus `CANCELLED`) is enforced by ordinary,
  fully-deterministic guards (`_require_state`, sender-address checks) — see `docs/contracts.md`
  "Full transition table."
- **Scoring and decision**: `compute_score` (weighted sum of PASS=full/PARTIAL=half/
  FAIL=UNVERIFIABLE=zero points per requirement) and `decide` (compare the score against the
  milestone's stored approval threshold) are plain, deterministic Python — they read only the
  validated statuses GenLayer's consensus produced, never the evaluator's own stated score or
  decision (which the contract structurally never even parses as a decision-relevant field — see
  `docs/security.md` C4).
- **Settlement**: `release_payment`/`refund_client` are ordinary, idempotency-latched value
  transfers gated purely by the deterministic `APPROVED`/`REJECTED` state — no AI involvement at
  all in moving funds.

This split is deliberate: GenLayer produces a judgment; a normal deterministic contract turns that
judgment into money moving, with no step where either side can substitute their own state for the
other's.

## Why a normal smart contract is insufficient

A conventional EVM (or any purely deterministic) contract cannot natively fetch `https://` content
or call an LLM as part of consensus — every validator must independently compute the exact same
result from the exact same inputs, and neither "the current content of an arbitrary webpage" nor
"an LLM's judgment of that content" is a value two independent machines can be guaranteed to agree
on without an explicit mechanism for reconciling non-deterministic output. Without that mechanism,
a project with WorkResolve's requirements has exactly two options, both worse than what GenLayer
provides: (1) a centralized oracle or backend service performs the evaluation off-chain and simply
reports a result the contract trusts — reintroducing the single point of trust/failure escrow was
supposed to remove, or (2) evaluation is skipped entirely and settlement falls back to one party's
manual attestation (a "client clicks approve" button) — which is the exact centralized-platform
problem WorkResolve exists to avoid. GenLayer's Intelligent Contract model is what lets the
evaluation itself be decentralized (independent validators, consensus-gated) rather than either
centralized or absent.

## GenLayer-specific proof (how to verify this yourself)

- **Intelligent Contract source**: `contracts/workresolve.py` (the deployable source);
  `contracts/logic/workresolve_logic.py` is a pure-Python, independently-testable mirror of its
  deterministic core (see that file's own docstring for why the split exists).
- **Contract address / network**: not yet available — no deployment has been made from this
  development environment (no reachable Docker daemon, no `genlayer.com` network egress — see
  `docs/limitations.md`). This section must be filled in with the real address and network the
  moment a deployment exists; see `docs/release-notes.md` "Blockers to v1.0.0."
- **Relevant contract methods**: `evaluate_and_finalize` (the one GenLayer-dependent method —
  `contracts/workresolve.py`, search for `gl.get_webpage`/`gl.exec_prompt`/
  `gl.eq_principle_prompt_comparative`); `compute_score`/`decide` (the deterministic consumers of
  its result).
- **Evaluation flow**: fully documented end to end in `docs/evaluation.md`, including the exact
  prompt structure, the evaluator input schema, and the consensus visualization shown in the UI.
- **Transaction/reference examples**: none exist yet for the same deployment reason above — see
  `docs/demo.md` for the exact script to produce them once a deployment exists.

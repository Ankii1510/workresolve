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
- **Contract address / network**: deployed to **GenLayer Asimov Testnet** (alias `testnet-asimov`,
  chain id `4221`, RPC `https://rpc-asimov.genlayer.com`).
  - **Current contract address**: `0x14255277822815F43DA58271d8d28f0F844cf209`
  - Deployment transaction: `0x85b326bb39ee766cb6f932ce9a098fbb37b158724f40184d268d4543b645f30a`
  - Explorer: https://explorer-asimov.genlayer.com/ (search the address or transaction hash above)
  - Deployed via the official `genlayer` CLI (`genlayer deploy --contract workresolve.py`) from a
    machine with real network access — this development sandbox itself has no `genlayer.com`
    network egress (see `docs/limitations.md`), so deployment was performed outside it, not by
    disabling or working around that restriction.
  - **Verified as genuinely live**, not just a returned address/hash (see `docs/limitations.md` for
    why that distinction matters here): `genlayer receipt <deployTxHash>` shows
    `txExecutionResultName: FINISHED_WITH_RETURN`, and `genlayer code <address>` returns this
    contract's actual full source — proof `__init__` completed and code is genuinely stored on-chain.
  - **This is the fourth deployment.** Three prior addresses are permanently dead — none of them
    ever finished a successful `__init__`, despite each returning what looked like a normal
    address+hash from `genlayer deploy`:
    - `0x9F3B3360a4219A276ba76600e1CCD7B924eDC6C0` (tx
      `0xbcb13223a03a32a23adf217727adcc6884002d08c2e98c44fbebf2a19ced72dc`) — the original
      deployment, predates a GenLayer reviewer's feedback that required contract-code fixes
      (confirmed native-transfer mechanism, deadline-gated submission, and upgradability — see
      `docs/release-notes.md` "Post-launch fixes" and `docs/contracts.md` "Escrow Architecture" /
      "Upgradability").
    - `0x7BB7A6D936Fd72149424AE3681304dBc4E575B79` (tx
      `0x60845f0b3a6d037fa327ff885ac6e666f3594475f7cf32614b99560233e4fe46`) — carried those fixes,
      but hit a GenVM comment-concatenation parse bug in this file's header.
    - `0x8366417A85498fF3Ff8012E85Ab2DE7d6FE83b16` (tx
      `0x892c9305bc998bc45e42311eda8c3f1117fc091a348c92a65c90109a23ef43e3`) — fixed the parse bug,
      but then hit a second bug: `py-genlayer:test` is a debug-only runner id, invalid on the public
      testnet.
    Both bugs are explained in full, with the exact `genlayer trace` output that diagnosed each, at
    the top of `contracts/workresolve.py` and in `docs/limitations.md`. This new address is the one
    currently live and the one the frontend's `NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS` should point
    at. Thanks to the upgradability mechanism built into the contract (and now genuinely exercised,
    since this deployment's `__init__` actually ran), this should be the last time a fix requires a
    new address — future fixes can go through the contract's own `upgrade()` method instead.
- **Relevant contract methods**: `evaluate_and_finalize` (the one GenLayer-dependent method —
  `contracts/workresolve.py`, search for `gl.get_webpage`/`gl.exec_prompt`/
  `gl.eq_principle_prompt_comparative`); `compute_score`/`decide` (the deterministic consumers of
  its result).
- **Evaluation flow**: fully documented end to end in `docs/evaluation.md`, including the exact
  prompt structure, the evaluator input schema, and the consensus visualization shown in the UI.
- **Transaction/reference examples**: the deployment transaction above is the first real one. A
  real APPROVE and a real REJECT milestone lifecycle (two wallets, real testnet GEN, real
  transaction hashes) are the next step — see `docs/demo.md`.

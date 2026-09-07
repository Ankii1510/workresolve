# Release Notes

## v0.1.0-testnet (Phase 9 — feature freeze)

This is the first version number assigned to WorkResolve. Semantic versioning, GenLayer-testnet
qualifier:

- **0** (major) — pre-1.0: the product has never had a real, verified live deployment. Bumping to
  `1.0.0` should wait until a real contract deployment and a real two-wallet APPROVE/REJECT run
  have actually happened (see "Blockers to v1.0.0" below).
- **1** (minor) — the full intended MVP surface exists: Create → Fund → Accept → Submit → Evaluate
  → Consensus → Settle, plus reputation, local history, and notifications (Phases 1-7).
- **0** (patch) — no post-release patch yet; this is the first tagged state.
- **-testnet** — pre-release qualifier: this version has never run against a live network. It
  should not be referred to as production-ready or mainnet-ready under any circumstance.

## Feature freeze

Effective from this phase forward: **no new product features** are added unless required for
security, deployment, reliability, demo readiness, GenLayer submission material, or a critical UX
fix a new user would trip over immediately. Everything else — token mechanics, NFTs, DAO
governance, a marketplace, additional AI agents, social features, more elaborate reputation math, a
centralized AI fallback for evaluation, or new backend infrastructure — is explicitly out of scope
for this release and belongs on the roadmap (see `README.md` "Roadmap"), not in this codebase.

## What's in v0.1.0-testnet

- The full on-chain flow: milestone creation with weighted requirements, escrow funding,
  freelancer acceptance, evidence submission, permissionless GenLayer evaluation, consensus-backed
  APPROVE/REJECT, and settlement (release or refund) — all through real `genlayer-js` calls, no
  mock layer in any user-facing path.
- On-chain-derived reputation, a local per-wallet transaction/activity log, in-app toasts, deadline
  labeling, a full evidence viewer, and global error boundaries (Phase 7).
- A full security hardening pass: URL-scheme validation on submitted evidence (contract + frontend),
  a verified production CSP and security headers, malformed-evaluation-payload rejection covering
  every scenario in the Phase 8 red-team list, and 90/90 contract logic tests plus 144/144 frontend
  unit tests (Phases 7-8).
- Complete documentation set: architecture, contracts, frontend, evaluation, security, demo guide,
  known limitations, and a release checklist (Phases 1-8), extended this phase with
  `docs/genlayer-integration.md`, `docs/project-description.md`, `docs/pitch.md`,
  `docs/demo-video-script.md`, `docs/submission.md`, `docs/final-release-checklist.md`, and
  `SECURITY.md`.
- An MIT `LICENSE` (added this phase).

## Post-launch fixes (after initial testnet + frontend deployment)

- **EIP-6963 multi-wallet discovery.** The wallet connect flow previously read only the single,
  ambiguous `window.ethereum` slot — with more than one wallet extension installed, whichever one
  last overwrote it won, silently, with no way to pick another. `lib/genlayer/eip6963.ts` now
  discovers every EIP-6963-compliant installed wallet, and `components/wallet/WalletConnectButton`
  shows a picker whenever more than one is available (falls back to a single "Browser Wallet" legacy
  option when none announce via EIP-6963). No new dependency or external service — this is a plain
  browser event convention (see `docs/frontend.md` "Wallet Architecture"). Test suite grew from
  144/144 to 149/149 frontend unit tests as part of this fix.

- **Transaction confirmation timeout increased; "failed" no longer shown for an unresolved wait.**
  The first real write against the live Asimov testnet (create_milestone) was still processing
  according to GenLayer's own explorer well past 30 seconds, but this app gave up waiting after
  genlayer-js's own default (`waitInterval: 3000ms x retries: 10`) and showed "Transaction failed."
  — alarming and inaccurate, since the transaction was never actually rejected on-chain.
  `lib/genlayer/transactions.ts` now waits up to 5 minutes (5s interval x 60 retries) before giving
  up, and `TransactionStatusBanner` no longer shows the "Transaction failed" heading or red/danger
  styling for a `TRANSACTION_TIMEOUT` specifically — it shows "Still confirming — didn't hear back
  in time." instead, with a note to check the explorer before assuming a redo is needed. Test suite
  grew from 149/149 to 152/152 frontend unit tests as part of this fix.

- **GenLayer reviewer feedback addressed: confirmed native transfer mechanism, deadline-gated
  submission, and deterministic funded-lifecycle tests.** Submitting `contracts/workresolve.py` for
  project credit on GenLayer's own submission portal, a reviewer flagged three real gaps:
  1. The contract's outbound transfer call, `gl.ContractAt(recipient).emit_transfer(amount)`, was an
     invented API that does not exist in GenLayer's real SDK. Replaced with `_pay_out()` /
     `_ExternalRecipient(...).emit_transfer(value=...)`, matching the "Faucet" example on GenLayer's
     own "Value Transfers" documentation page verbatim (see `docs/contracts.md` "Escrow
     Architecture" for the exact citation).
  2. `submit_work` had no deadline check at all, so a freelancer could submit (or re-submit) work
     after `milestone.deadline` had passed — and because submitting moves the milestone into
     `SUBMITTED`, a state `cancel_milestone` does not accept, this could permanently strand a
     client's escrowed funds with no way to cancel. `submit_work` now rejects any submission once
     `_now_unix() >= int(milestone.deadline)`, the exact complement of `cancel_milestone`'s own
     deadline check, so the client's cancellation right is preserved.
  3. Added a fully deterministic (no-LLM, always-executing) funded-lifecycle test —
     `TestCancelMilestone::test_can_cancel_and_get_refunded_after_deadline_with_no_submission` in
     `contracts/tests/test_workresolve.py` — proving the confirmed transfer mechanism actually moves
     escrowed funds back to the client once a deadline passes with no submission, without depending
     on live LLM evaluation output the way `release_payment`/`refund_client`'s own tests must.
  `contracts/tests_logic` grew from 90/90 to 94/94 real, executed, passing tests as part of this fix
  (`can_submit_work` and its four unit tests). The gltest-based integration file
  (`contracts/tests/test_workresolve.py`) still requires a live GenVM network to actually run — see
  that file's own module docstring for exact run instructions and an honest breakdown of which tests
  are deterministic versus LLM-dependent.

## What's explicitly NOT in v0.1.0-testnet

- No live deployment. No contract address exists on any network. No production frontend URL
  exists. See "Blockers to v1.0.0" below for exactly why, and `docs/limitations.md` for the full
  honest limitations list.
- No file/decentralized storage integration, no dispute/appeals mechanism beyond the evaluation
  itself, no legal arbitration, no multi-milestone contracts, no partial releases — all documented,
  deliberate MVP scope decisions, not oversights (see `docs/contracts.md` "MVP scope carried
  forward").

## Blockers to v1.0.0

1. ~~A real contract deployment to a GenLayer network~~ — **done.** Deployed to GenLayer Asimov
   Testnet (`testnet-asimov`, chain id `4221`) via the official `genlayer` CLI, from a machine with
   real network access (this development sandbox itself still has no `genlayer.com` egress — see
   `docs/limitations.md`).
   - Contract address: `0x9F3B3360a4219A276ba76600e1CCD7B924eDC6C0`
   - Deployment transaction: `0xbcb13223a03a32a23adf217727adcc6884002d08c2e98c44fbebf2a19ced72dc`
   - Explorer: https://explorer-asimov.genlayer.com/
2. A real two-wallet APPROVE flow and REJECT flow, executed and recorded with actual transaction
   hashes. **Still pending.**
3. ~~A deployed, publicly reachable production frontend pointed at that contract~~ — **done.** Live
   at https://workresolve.vercel.app/, deployed on Vercel and configured with
   `NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS` pointed at the deployed contract (verified: the
   Create Milestone form loads with no "not configured" error).

Items 1 and 3 were deployment/infrastructure actions, not code changes, and required an environment
with real network access, which this development sandbox does not have — both were performed from
the project owner's own machine. Item 2 remains.

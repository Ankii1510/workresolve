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

## What's explicitly NOT in v0.1.0-testnet

- No live deployment. No contract address exists on any network. No production frontend URL
  exists. See "Blockers to v1.0.0" below for exactly why, and `docs/limitations.md` for the full
  honest limitations list.
- No file/decentralized storage integration, no dispute/appeals mechanism beyond the evaluation
  itself, no legal arbitration, no multi-milestone contracts, no partial releases — all documented,
  deliberate MVP scope decisions, not oversights (see `docs/contracts.md` "MVP scope carried
  forward").

## Blockers to v1.0.0

1. A real contract deployment to a GenLayer network reachable from wherever this is built (this
   development sandbox has neither a reachable Docker daemon nor network egress to any
   `genlayer.com` host — re-confirmed every phase since Phase 4, including this one).
2. A real two-wallet APPROVE flow and REJECT flow, executed and recorded with actual transaction
   hashes.
3. A deployed, publicly reachable production frontend pointed at that contract.

None of these are code changes — they are deployment/infrastructure actions that require an
environment with real network access, which this one does not have.

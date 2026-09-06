# Known Limitations

Stated plainly, updated as of Phase 8. Only limitations that actually apply to this codebase as it
stands today are listed — nothing here is a generic disclaimer.

## Environment / verification

- **Nothing in this codebase has ever run against a live or local GenVM.** No reachable Docker
  daemon (rules out a local GenLayer Studio simulator) and no network egress to any `genlayer.com`
  host exist in this development sandbox — re-confirmed with a live check at the start of Phase 8,
  the same result as every prior phase. Every claim about contract correctness, evaluation
  behavior, and escrow accounting is verified at the deterministic pure-Python logic level (90/90
  tests in `contracts/tests_logic`), not against real validator consensus.
- **`gl.ContractAt(...).emit_transfer(...)`, the mechanism that actually moves funds out of the
  contract, has never been exercised.** This is the single highest-priority item to verify before
  this contract is trusted with real funds — see `docs/contracts.md` "Known Limitations."
- **Wallet and browser edge cases (locked wallet, mid-session account/network switch, browser
  refresh during a pending transaction) were verified by code review, not live manual testing.** No
  browser automation was used in any phase of this project.
- **No dedicated mobile-device or screen-reader hardware/AT testing was performed.** Responsive
  layout and accessibility semantics (labels, focus order, keyboard traps) were reviewed at the
  code level; no real device lab or screen reader session confirmed the result.

## Product design (intentional, not bugs)

- **AI evaluation is probabilistic, not a deterministic legal judgment.** GenLayer's validator
  consensus reads submitted evidence against fixed requirements and produces a structured result,
  but an LLM-mediated judgment of "does this website satisfy 'responsive design'" is inherently a
  judgment call, not an exact computation. This is the explicit tradeoff the whole project makes
  (see `docs/evaluation.md`), not a defect to be fixed.
- **External evidence can disappear or change after submission.** A submitted deployed URL or
  repository can go offline, be deleted, or be edited after the freelancer submits it. The contract
  evaluates whatever GenLayer's validators could fetch at evaluation time; it has no way to verify
  evidence was unchanged since submission, and no snapshot/archival mechanism exists.
- **No dispute or appeals mechanism beyond the evaluation itself.** Once `evaluate_and_finalize`
  reaches consensus and the corresponding settlement (`release_payment`/`refund_client`) executes,
  there is no on-chain appeal, arbitration, or override path. This is a deliberate MVP scope
  decision (see `docs/contracts.md` "MVP scope carried forward"), not an oversight.
- **No legal arbitration or off-chain recourse is provided or implied.** WorkResolve settles funds
  according to its own evaluation logic; it makes no claim to be a substitute for a legal contract
  or dispute process.
- **Testnet only.** Nothing in this repository has been deployed to a production/mainnet network,
  and no production deployment process has been exercised.
- **Reputation and transaction history are both derived from what's directly queryable, not a full
  indexer.** Reputation is a running counter maintained by the contract itself (fully authoritative,
  recomputable from `get_reputation`/the milestone-list views at any time — see
  `docs/contracts.md` "Reputation Architecture"). Transaction history, by contrast, is a **local,
  per-wallet, per-browser log** (`src/lib/activity.ts`) — it does not persist across browsers or
  devices, and is not a claim to a complete historical ledger. GenLayer exposes no
  event-subscription/indexing API this app could build a complete cross-browser history from
  without adding backend infrastructure outside this project's scope.
- **No decentralized file storage integration.** Evidence is submitted as URLs (a deployed site, a
  repository, up to 10 additional links) — there is no IPFS pinning or on-chain file storage. The
  `.env.example` documents a placeholder for a future `/api/ipfs/upload` route that has never been
  implemented.
- **Evaluator/consensus availability and latency are outside this app's control.** GenLayer's
  validator network's response time for `evaluate_and_finalize` is not something the frontend can
  predict or speed up; the UI shows real progress through consensus stages rather than a fixed
  countdown, but a slow validator round will still be a slow round.
- **Gas/transaction costs are real and are the user's own testnet funds.** No fee is subsidized or
  hidden by this application.

## Things checked and found NOT to be a limitation (so they aren't over-claimed as gaps)

- Escrow accounting cannot double-pay or double-refund by construction (mutually exclusive
  `paid`/`refunded` latches gated by disjoint states — see `docs/contracts.md` "Double Settlement
  Protection" and the Phase 8 audit in `docs/security.md`), not merely "usually works."
- Requirements cannot be altered after `create_milestone` under any code path — this was verified
  by direct code reading, not assumed.

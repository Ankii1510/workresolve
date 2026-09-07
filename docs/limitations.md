# Known Limitations

Stated plainly, updated as of Phase 8. Only limitations that actually apply to this codebase as it
stands today are listed — nothing here is a generic disclaimer.

## Environment / verification

- **The contract is deployed on GenLayer's real Asimov Testnet** (current address
  `0x7BB7A6D936Fd72149424AE3681304dBc4E575B79`, tx
  `0x60845f0b3a6d037fa327ff885ac6e666f3594475f7cf32614b99560233e4fe46` — see
  `docs/genlayer-integration.md`), deployed via the official `genlayer` CLI from a machine with real
  network access. This is a redeployment: the original deployment
  (`0x9F3B3360a4219A276ba76600e1CCD7B924eDC6C0`) predates reviewer-driven fixes to the transfer
  mechanism, deadline handling, and upgradability, and is superseded. This development sandbox itself
  still has no `genlayer.com` network egress and no reachable Docker daemon, so the deployment and
  any live-network testing from here on must continue to happen from a machine with real access, not
  from this sandbox. As of this deployment, no milestone lifecycle (fund → accept → submit →
  evaluate → settle) has yet been run against the live contract, so `evaluate_and_finalize`'s real
  `gl.exec_prompt`/`gl.get_webpage` calls and real validator consensus remain unexercised in
  practice — every claim about contract correctness, evaluation behavior, and escrow accounting is
  still verified only at the deterministic pure-Python logic level (94/94 tests in
  `contracts/tests_logic`) plus this one deployment transaction, not a full live run.
- **The outbound transfer mechanism now matches GenLayer's documented API, but still needs a live-
  network run to confirm end to end.** A GenLayer reviewer flagged the earlier
  `gl.ContractAt(...).emit_transfer(...)` call as not a real API; it has been replaced with
  `_pay_out()` / `_ExternalRecipient(...).emit_transfer(value=...)`, matching GenLayer's own "Value
  Transfers" documentation, and shipped in the redeployment above. This is the single
  highest-priority item to verify next against the live deployment, via
  `contracts/tests/test_workresolve.py::TestCancelMilestone`'s two deterministic (no-LLM) refund
  tests — see `docs/contracts.md` "Known Limitations."
- **Reads against a just-(re)deployed contract can briefly fail with a GenLayer-side "resource not
  found" RPC error, not an app bug.** After the redeployment above, the dashboard's
  `get_milestones_by_client`/`_by_freelancer` reads failed with GenLayer's own raw RPC error (EIP-1474
  code `-32001`, "Requested resource not found.") for a period afterward — most likely because the RPC
  node serving the read hadn't yet caught up on the freshly deployed contract's state. This raw message
  was previously shown to the user verbatim; `classifyBlockchainError`
  (`src/lib/genlayer/errors.ts`) now recognizes it and shows a clear, accurate explanation instead
  ("expected for a few minutes after a deployment/redeployment — try again shortly"), with regression
  tests in `src/tests/unit/errors.test.ts`. This is a real, observed GenLayer testnet behavior right
  after a (re)deployment, not something this app can prevent — only explain honestly while it clears.
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

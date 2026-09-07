# Known Limitations

Stated plainly, updated as of Phase 8. Only limitations that actually apply to this codebase as it
stands today are listed — nothing here is a generic disclaimer.

## Environment / verification

- **RESOLVED, and the real reason two prior deployments never actually worked: a GenVM
  "runner-comment" parsing bug in this file's own header, not a validator/consensus issue.**
  Both the original deployment (`0x9F3B3360a4219A276ba76600e1CCD7B924eDC6C0`) and the first
  reviewer-driven redeployment (`0x7BB7A6D936Fd72149424AE3681304dBc4E575B79`) returned what looked
  like a normal success (a contract address and a transaction hash) from `genlayer deploy`, but
  neither ever actually worked: every subsequent read (`get_milestones_by_client`/`_by_freelancer`)
  failed with GenLayer's raw RPC error "Requested resource not found." (EIP-1474 code `-32001`), and
  every write (e.g. `create_milestone`) finalized with `txExecutionResultName: FINISHED_WITH_ERROR`.
  Root-caused using `genlayer receipt <deployTxHash>` (showed the *deployment transaction itself*
  finalized with `FINISHED_WITH_ERROR`, meaning `__init__` never actually completed) and
  `genlayer trace <deployTxHash>` (showed the GenVM-level cause directly: `invalid_contract` —
  `"trailing characters at line 1 column 36"`, column 36 being exactly one character past the closing
  brace of this file's `# { "Depends": "py-genlayer:test" }` header). GenVM concatenates every
  *contiguous* leading `#` comment line (no blank line between them) into a single "runner comment"
  block and parses the whole thing as one JSON document — `genlayer-cli`'s own bundled template
  (`football_bets.py`) puts a blank line immediately after the Depends comment for exactly this
  reason, and this file did not, so its ~60-line documentation preamble was glued onto the Depends
  JSON and produced a parse error before a single line of `__init__` could run. **Fixed** by adding
  the required blank line (see the top of `contracts/workresolve.py` for the in-file explanation).
  This means a **third deployment is required** — both addresses above are, and will always be, dead
  (no code was ever successfully committed to either). See `docs/release-notes.md` for the new
  address once redeployed.
- **`classifyBlockchainError` (`src/lib/genlayer/errors.ts`) now recognizes GenLayer's raw
  "Requested resource not found." RPC error (code `-32001`) instead of showing it verbatim** — this
  is what first surfaced the deployment bug above (it showed up as this raw error on the dashboard).
  The friendly message it now shows correctly hedges both real causes: brief post-deployment network
  lag (which does clear on its own) and a deployment that never actually finished (which does not,
  and needs `genlayer receipt`/`genlayer trace` on the deployment tx to confirm, exactly as done
  above). Regression tests in `src/tests/unit/errors.test.ts`.
- **This development sandbox still has no `genlayer.com` network egress and no reachable Docker
  daemon**, so deployment, `genlayer trace`/`genlayer receipt` calls, and any other live-network
  command must run from a machine with real access, not from this sandbox. As of the redeployment
  above (now known dead), no milestone lifecycle (fund → accept → submit → evaluate → settle) had
  been run against a genuinely live contract, so `evaluate_and_finalize`'s real
  `gl.exec_prompt`/`gl.get_webpage` calls and real validator consensus remain unexercised in
  practice — every claim about contract correctness, evaluation behavior, and escrow accounting is
  still verified only at the deterministic pure-Python logic level (94/94 tests in
  `contracts/tests_logic`), not a full live run, until the next deployment succeeds.
- **The outbound transfer mechanism matches GenLayer's documented API on paper, but still needs a
  live-network run to confirm end to end** — now blocked on the third deployment above rather than
  by anything wrong with the mechanism itself. A GenLayer reviewer flagged the earlier
  `gl.ContractAt(...).emit_transfer(...)` call as not a real API; it has been replaced with
  `_pay_out()` / `_ExternalRecipient(...).emit_transfer(value=...)`, matching GenLayer's own "Value
  Transfers" documentation. This is the single highest-priority item to verify once a working
  deployment exists, via `contracts/tests/test_workresolve.py::TestCancelMilestone`'s two
  deterministic (no-LLM) refund tests — see `docs/contracts.md` "Known Limitations."
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

# Known Limitations

Stated plainly, updated as of Phase 8. Only limitations that actually apply to this codebase as it
stands today are listed — nothing here is a generic disclaimer.

## Environment / verification

- **RESOLVED, and the real reason three straight deployments never actually worked: two separate
  GenVM-level bugs in this file's own header comment, not a validator/consensus issue.** The
  original deployment (`0x9F3B3360a4219A276ba76600e1CCD7B924eDC6C0`), the first reviewer-driven
  redeployment (`0x7BB7A6D936Fd72149424AE3681304dBc4E575B79`), and a second redeployment
  (`0x8366417A85498fF3Ff8012E85Ab2DE7d6FE83b16`) each returned what looked like a normal success (a
  contract address and a transaction hash) from `genlayer deploy`, but none of them ever actually
  worked: every subsequent read (`get_milestones_by_client`/`_by_freelancer`) failed with GenLayer's
  raw RPC error "Requested resource not found." (EIP-1474 code `-32001`), and every write (e.g.
  `create_milestone`) finalized with `txExecutionResultName: FINISHED_WITH_ERROR`. Root-caused using
  `genlayer receipt <deployTxHash>` (showed the *deployment transaction itself* finalized with
  `FINISHED_WITH_ERROR`, meaning `__init__` never actually completed) and
  `genlayer trace <deployTxHash>` (showed the exact GenVM-level cause each time), in two rounds:
  1. **Comment-concatenation parse bug** (hit by the first two deployments): `invalid_contract` —
     `"trailing characters at line 1 column 36"`, column 36 being exactly one character past the
     closing brace of this file's `# { "Depends": ... }` header. GenVM concatenates every
     *contiguous* leading `#` comment line (no blank line between them) into a single "runner
     comment" block and parses the whole thing as one JSON document — `genlayer-cli`'s own bundled
     template (`football_bets.py`) puts a blank line immediately after the Depends comment for
     exactly this reason, and this file did not, so its ~60-line documentation preamble was glued
     onto the Depends JSON. **Fixed** by adding the required blank line.
  2. **Invalid runner id** (hit by the third deployment, once the parse bug above was fixed):
     `invalid_contract` — `"invalid runner id: py-genlayer:test"`, preceded by the warning
     `":test/ :latest runner used in non-debug mode, this is not allowed"`. `py-genlayer:test` (used
     by this file, `genlayer-cli`'s own bundled template, and most public tutorials) is only a valid
     runner id in GenVM's local Studio/simulator *debug* mode — GenLayer's public Asimov Testnet runs
     in non-debug mode and requires a real, pinned runner version hash. **Fixed** by switching to
     `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`, the hash GenLayer's own
     documentation cites verbatim on both its introduction and upgradability pages.

  See the top of `contracts/workresolve.py` for the in-file explanation of both.

  **A fourth deployment, with both fixes applied, succeeded and was verified genuinely live** —
  address `0x14255277822815F43DA58271d8d28f0F844cf209`, tx
  `0x85b326bb39ee766cb6f932ce9a098fbb37b158724f40184d268d4543b645f30a`. Verified two ways, not just
  by the CLI's own "deployed successfully" message (which, as this whole entry demonstrates, does
  not mean the deployment actually worked): `genlayer receipt` on the deployment tx shows
  `txExecutionResultName: FINISHED_WITH_RETURN` (not `FINISHED_WITH_ERROR`, unlike all three prior
  attempts), and `genlayer code 0x1425...` returns this contract's actual full source rather than
  GenLayer's "contract code not found" error. All three prior addresses remain permanently dead. See
  `docs/release-notes.md` and `docs/genlayer-integration.md` for the current address everywhere else
  it's cited (README.md, docs/submission.md, the frontend's
  `NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS`).
- **RESOLVED — a third real bug, this time application-level, found the first time `create_milestone`
  was actually called against the genuinely-live fourth deployment: `_hash_requirements` called
  `gl.hash(...)`, a function that does not exist anywhere in GenLayer's real SDK.** It was an
  unverified `[TBD-confirm]` guess from Phase 2 that passed every local test and every deployment
  check (both only exercise the pure-Python mirror in `contracts/logic/workresolve_logic.py`, which
  correctly uses `hashlib.sha256`; the gltest integration suite that would have caught this needs a
  live network this sandbox has never had), then made every real `create_milestone` transaction fail
  with `txExecutionResultName: FINISHED_WITH_ERROR`. Root-caused with `genlayer trace <txId>` on the
  failing transaction, which showed the exact Python traceback: `AttributeError: module 'genlayer.gl'
  has no attribute 'hash'`, raised from this line. GenLayer's real SDK does expose a hash primitive —
  `genlayer.py.keccak.Keccak256` (confirmed via `https://sdk.genlayer.com/v0.1.0/_modules/genlayer/py/keccak.html`)
  — but switching to it would have silently broken this contract's own documented parity requirement
  with the frontend (`src/lib/genlayer/canonical.ts`) and the pure-Python mirror, both of which
  compute `requirements_hash` with SHA-256 specifically so a client can independently recompute it.
  **Fixed** by using Python's built-in `hashlib.sha256` directly — plain deterministic computation
  with no I/O or randomness, compiled into CPython itself (no OpenSSL/OS dependency), so it behaves
  identically inside GenVM's sandboxed Python as anywhere else — making `_hash_requirements` on-chain
  byte-for-byte identical to `hash_requirements()` in `contracts/logic/workresolve_logic.py` again.
  **Fixed via the contract's own `upgrade()` method, not a fifth redeployment** — this is exactly the
  scenario the upgradability mechanism (added earlier this phase, see "Post-launch fixes" in
  `docs/release-notes.md`) exists for. `genlayer write`'s CLI, however, has no way to actually carry a
  whole file's bytes as an argument (its only `bytes` syntax is an inline `b#<hex>` string, and
  hex-encoding this ~46 KB file produces ~92,000 characters — well past Windows' command-line length
  limit), so `scripts/upgrade-contract.mjs` was added: a small Node script that calls genlayer-js's
  own `writeContract` directly with the file's raw bytes (no CLI length limit at all), reusing the
  same account genlayer-cli used to deploy. See that script's own header comment for exact usage.
  **Verified genuinely live**, the same two-way way as every fix in this project: upgrade transaction
  `0x6e0879d642d9e7ccecdb85bd7bd6be8889e38459f2a848338c765543db799fa7` — `genlayer receipt` shows
  `txExecutionResultName: FINISHED_WITH_RETURN`, and `genlayer code 0x1425...` now returns the
  corrected source (`import hashlib`, `hashlib.sha256(...)` in `_hash_requirements`, `gl.hash` gone)
  at the same address as before — no new deployment, no new address to update anywhere.
- **CONFIRMED NETWORK-SIDE, NOT AN APP BUG: GenLayer's Asimov testnet itself had a liveness issue on
  2026-09-08, right after the `gl.hash` fix above went live.** The very first real `create_milestone`
  against the fixed, upgraded contract succeeded (`FINISHED_WITH_RETURN`), proving the fix works. Two
  subsequent `fund_milestone` attempts, however, both finalized as `NOT_VOTED`/`IDLE` with **zero**
  validators ever voting (`votesCommitted: 0, votesRevealed: 0`) — the network never picked the
  transactions up at all. After that, every read against this contract (`get_milestone`,
  `get_milestones_by_client`/`_by_freelancer`) started failing with `execution failed: failed to get
  contract state: getting latest accepted transaction: failed to get latest accepted transactions:
  caller error`. This was reproduced with `npx genlayer call <address> get_milestone --args 1`
  directly — no frontend involved — ruling out an app-side cause. `npx genlayer finalize <txId>` on
  the two stuck transactions was also attempted, to try to unstick the queue; it failed too, reverting
  at GenLayer's own on-chain consensus contract (an EVM-level revert, `data: '0x90cb8b61'`), which is
  further evidence this is GenLayer's Asimov testnet infrastructure, not this app or its contract. No
  code fix exists for this on WorkResolve's side — it requires GenLayer's own network to recover
  and/or its team to look at the stuck transactions. **What WAS fixed**: `classifyBlockchainError`
  used to have no pattern for this specific RPC message, so it fell through to the generic fallback
  and showed viem's raw, actively misleading `shortMessage` — "Missing or invalid parameters. Double
  check you have provided the correct parameters." — on the dashboard, even though no parameter was
  ever wrong. It now recognizes this message and shows an accurate explanation instead (see
  `isContractStateUnavailableError` in `src/lib/genlayer/errors.ts`).
- **`classifyBlockchainError` (`src/lib/genlayer/errors.ts`) now recognizes GenLayer's raw
  "Requested resource not found." RPC error (code `-32001`) instead of showing it verbatim** — this
  is what first surfaced the deployment bug above (it showed up as this raw error on the dashboard).
  The friendly message it now shows correctly hedges both real causes: brief post-deployment network
  lag (which does clear on its own) and a deployment that never actually finished (which does not,
  and needs `genlayer receipt`/`genlayer trace` on the deployment tx to confirm, exactly as done
  above). Regression tests in `src/tests/unit/errors.test.ts`.
- **This development sandbox still has no `genlayer.com` network egress and no reachable Docker
  daemon**, so deployment, `genlayer trace`/`genlayer receipt` calls, and any other live-network
  command must run from a machine with real access, not from this sandbox. As of the fourth (now
  live) deployment above, no milestone lifecycle (fund → accept → submit → evaluate → settle) has
  yet been run against it, so `evaluate_and_finalize`'s real `gl.exec_prompt`/`gl.get_webpage` calls
  and real validator consensus remain unexercised in practice — every claim about contract
  correctness, evaluation behavior, and escrow accounting is still verified only at the deterministic
  pure-Python logic level (94/94 tests in `contracts/tests_logic`), not a full live run, until a real
  lifecycle is exercised against this deployment.
- **The outbound transfer mechanism matches GenLayer's documented API on paper, but still needs a
  live-network run to confirm end to end** — no longer blocked on deployment (see above), just not
  yet exercised. A GenLayer reviewer flagged the earlier `gl.ContractAt(...).emit_transfer(...)` call
  as not a real API; it has been replaced with `_pay_out()` /
  `_ExternalRecipient(...).emit_transfer(value=...)`, matching GenLayer's own "Value Transfers"
  documentation. This is the single highest-priority item to verify next against the live
  deployment, via `contracts/tests/test_workresolve.py::TestCancelMilestone`'s two deterministic
  (no-LLM) refund tests — see `docs/contracts.md` "Known Limitations."
- **Wallet and browser edge cases (locked wallet, mid-session account/network switch, browser
  refresh during a pending transaction) were verified by code review, not live manual testing.** No
  browser automation was used in any phase of this project.
- **No dedicated mobile-device or screen-reader hardware/AT testing was performed.** Responsive
  layout and accessibility semantics (labels, focus order, keyboard traps) were reviewed at the
  code level; no real device lab or screen reader session confirmed the result.

### Deploying to the wrong network is silent, and every symptom points somewhere else (2026-09-09/10)

The most expensive misdiagnosis in this project, recorded in full because almost every instinct it
provoked was wrong.

`NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_STUDIONET` was set to
`0x941F3904D19b39113d82AA3dC8942966b33fCB64` — a contract that had in fact been deployed to
**Asimov**, because the terminal that ran `genlayer deploy` still had `genlayer network set
testnet-asimov` active. (An earlier `genlayer network set studionet` had been run in a *different*
shell — a sandboxed VM with its own genlayer config and its own keystore, which is why its
`account list` showed a different deployer address entirely. Two shells, two configs; only one of
them was ever pointed at Studio.) With the app's network switcher on Studio, every write asked
Studio's consensus contract (`0xb7278A61…`) to call a contract that exists only on Asimov, and
Studio replied exactly as it should: `{ code: -32001, message: "Contract not found", data: {
address: "0x941F3904…" } }`.

Why it took a day:

- **Reads kept working.** `genlayer code <address>` succeeded throughout — from the same terminal,
  which was on Asimov, so it was reading the contract from the network it was actually on. A
  working read was taken as proof the contract was live "on Studio". It never was.
- **The wallet erased the reason.** OKX re-wrapped the node's reply as `{ code: -32603, message:
  "Transaction failed", data: { originalError: {} } }` — the real message emptied out — which
  reached the UI as "An internal error was received." Expanding `originalError` in the console
  showed `{}`. The reason only became visible after retrying the same transaction through a
  different, ethers-based wallet, which passed the node's error through verbatim.
- **A deploy receipt looks the same at a glance on either network.** It is not: genlayer-js returns
  a *simulator-shaped* transaction for Studio chains (`consensus_data.leader_receipt`, snake_case)
  and a *consensus-contract-shaped* one for real chains (`txCalldata`, `txDataDecoded`,
  `readStateBlockRange`, `lastRound`, `consumedValidators`, `activator`, `lastLeader`). The deploy
  receipt was the latter — and carried block numbers around 21,151,360, which no freshly-started
  simulator has. Both facts were in the receipt from the first minute.
- **Plausible-sounding platform theories filled the gap.** Studio resetting nightly, missing "ghost
  contracts", the deprecated `initializeConsensusSmartContract()`, OKX incompatibility, per-account
  contract scoping — each was investigated and none was the cause. The observation that finally
  broke it was the user's: another app (BrickProof) was working on Studio at the same moment, so
  Studio could not be broadly broken.

What is now in place so this class of mistake announces itself:

- `isContractNotFoundError` / `extractNotFoundAddress` in `src/lib/genlayer/errors.ts` classify this
  reply, name the address, name the currently-selected network, and say plainly that an address from
  a different GenLayer network is the most common cause. It is ordered *ahead* of the broader
  `isResourceNotFoundError`, whose "the network hasn't caught up with your deployment yet" wording is
  wrong here and actively sends the reader in the wrong direction. Regression tests in
  `src/tests/unit/errors.test.ts` pin all of it, including the ethers-wrapped and nested-wallet
  shapes.
- **A wallet that discards the node's reason entirely cannot be classified**, and nothing in this app
  can recover it. That is an accepted limit. When a wallet error says nothing useful, retry the same
  transaction through a second wallet before theorising about the network.

Two operational rules follow. Verify the active network *in the same shell* immediately before
deploying (`genlayer config get`), and verify a fresh deployment on that network's **own** explorer
(`explorer-studio.genlayer.com` vs `explorer-asimov.genlayer.com`) — an address that resolves on one
and 404s on the other settles the question in seconds, which is the check that was missing here.

**Note on what upgradability does and does not solve here.** This contract has been upgradeable since
Phase 8 (`root.upgraders` in `__init__`, the `upgrade()` method, `get_upgraders()`), and
`scripts/upgrade-contract.mjs` is the tool that drives it — already used successfully once, to ship
the `gl.hash` fix to the live Asimov contract without a redeployment. That is what keeps ONE address
stable across code changes: after a network's first deployment, no address on it ever has to be
re-issued, re-documented, or re-entered into Vercel again. It does **not** help with the incident
above, and cannot: a contract on Asimov and a contract on Studio are separate contracts at separate
addresses on unrelated chains, so every network needs its own first deployment, and each keeps its
own permanent address from then on. `scripts/upgrade-contract.mjs` originally hardcoded
`testnetAsimov`, which quietly limited upgrades to one network; it now takes the network as a
required first argument and echoes the resolved chain name, id and RPC before signing anything.

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

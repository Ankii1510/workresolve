# WorkResolve Frontend (Phase 5)

This document covers the frontend's real GenLayer integration: the wallet architecture, the
blockchain service layer, the transaction lifecycle, data fetching, and error handling. It
complements `docs/architecture.md` (system-wide design) and `docs/contracts.md` (the contract
itself). Every claim below about a GenLayer/genlayer-js API is sourced from the installed
`genlayer-js@1.1.8` package's own type declarations
(`node_modules/genlayer-js/dist/index-C3Ul1Rte.d.ts`, `.../chunk-XCQTIUTU.js`), inspected directly
during this phase — not assumed from documentation prose.

## Status: real integration code, never executed against a live network

Every function described below makes a real `readContract`/`writeContract`/
`waitForTransactionReceipt` call through genlayer-js — there is no mock layer, no fabricated
transaction hash, and no fabricated milestone data anywhere in the code paths a user actually hits.
But this development sandbox has no reachable Docker daemon (rules out a local GenLayer Studio
simulator) and no network egress to any `genlayer.com` domain (organization/agent-proxy policy,
re-confirmed at the start of this phase) — the same blockers documented in `docs/contracts.md`
"Known Limitations" for Phase 4. **Consequence: `contracts/workresolve.py` has still never been
deployed anywhere, `NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS` is unset, and every real call below
will fail with a clear `MISSING_ENV_VAR` error until a deployment exists.** That is the honest,
correct behavior — not a bug to work around with mock data. See the Phase 5 completion report for
exactly what this means for "no fake blockchain data" compliance.

## Phase 7 additions

Production-UX and hardening work added since the above was written, none of it changing the
blockchain integration itself:

- `src/lib/genlayer/explorer.ts` — one place that derives the connected chain's block-explorer
  name/URL from genlayer-js's own chain definition; never fabricates a URL for a chain with none.
- `src/lib/genlayer/deadline.ts` — purely cosmetic due-date labeling (`normal`/`soon`/`passed`);
  the contract only ever checks a deadline inside `cancel_milestone`, so this never blocks an
  action the contract would otherwise allow.
- `src/lib/activity.ts` — a `localStorage`-backed, per-wallet, per-browser record of confirmed
  transaction hashes, surfaced on `/profile`. Explicitly not a full historical ledger (see
  `docs/security.md` F10).
- `src/lib/notifications.ts` + the existing (previously unused) `ToastProvider` — an in-app toast
  fires once per confirmed write, using the same `describeAction()` copy the activity log uses.
- `src/components/evidence/EvidenceList.tsx` — the one place submission evidence URLs are
  rendered, as safe links only (see `docs/security.md` F1/F2).
- `src/app/error.tsx` / `src/app/global-error.tsx` — route- and root-level React error boundaries.
- `/profile` (`src/app/profile/page.tsx`) went from a Phase 3 stub to a real implementation reading
  `getReputation()` plus both milestone-index views — see `docs/contracts.md` "Reputation
  Architecture".

Full audit of all of the above: `docs/security.md`.

## Blockchain service layer

Conceptually organized as the phase spec's `lib/blockchain/{client,wallet,milestone,transactions,errors}`
— adapted to this repo's existing `src/lib/genlayer/` directory (established in Phase 3) rather than
introducing a second, parallel `lib/blockchain/` tree:

- **`client.ts`** (Phase 3, unchanged) — the only place `genlayer-js`'s `createClient` is called.
  `getReadClient()` returns a cached read-only client; `createWriteClient(account, provider)` builds
  a fresh write-capable client bound to the connected wallet.
- **`config.ts`** (Phase 3, unchanged) — resolves `NEXT_PUBLIC_GENLAYER_NETWORK` /
  `NEXT_PUBLIC_GENLAYER_RPC_URL` / `NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS`. `requireContractAddress()`
  throws a clear `ConfigError` when no contract is configured — the honest state of this repo today.
- **`wallet.ts`** (Phase 3 + Phase 5 additions) — low-level EIP-1193 helpers
  (`requestAccounts`, `getAuthorizedAccounts`, `getCurrentChainId`, `shortenAddress`) plus a new
  **`switchToExpectedNetwork(provider, chain)`**: tries `wallet_switchEthereumChain` (EIP-3326)
  first, falls back to `wallet_addEthereumChain` (EIP-3085) using `chain.rpcUrls`/`nativeCurrency`/
  `blockExplorers` taken directly from genlayer-js's own chain definitions — never invented network
  details.
- **`milestone.ts`** (new, Phase 5) — **the one place UI code calls into the deployed contract.**
  Every write (`createMilestone`, `fundMilestone`, `acceptMilestone`, `submitWork`,
  `evaluateAndFinalize`, `releasePayment`, `refundClient`, `cancelMilestone`) and every read
  (`getMilestone`, `getSubmission`, `getEvaluation`, `getMilestonesByClient`,
  `getMilestonesByFreelancer`, `getReputation`, `getMilestoneCount`) is a real call using the exact
  snake_case function names from `contracts/workresolve.py` (`CONTRACT_FUNCTION_NAMES`). No UI
  component constructs a raw `readContract`/`writeContract` call itself.
- **`transactions.ts`** (new, Phase 5) — `sendWriteTransaction(client, address, {functionName, args,
  value})`: submits the write, waits for GenLayer's `FINALIZED` status (the terminal, fully-decided
  status per genlayer-js's `TransactionStatus` enum — not an earlier phase like `ACCEPTED`), and
  throws a `ContractRevertError` if the finalized execution failed
  (`txExecutionResultName === "FINISHED_WITH_ERROR"`).
- **`errors.ts`** (new, Phase 5) — blockchain-specific error classification: user rejection,
  unsupported wallet method, insufficient balance, RPC/network failure, timeout, and contract-revert
  messages mapped from the exact `raise ValueError(...)` strings in `contracts/workresolve.py` to
  short, friendly text (`friendlyRevertMessage`). Feeds into `src/lib/utils/errors.ts`'s single
  `toAppError` funnel, which every catch block in the app already used from Phase 3 onward.
- **`milestoneForm.ts`** (new, Phase 5) — pure, unit-tested milestone-creation form validation,
  extracted from the Create Milestone page so it's testable without rendering.

## Wallet Architecture

`useWallet()` (`src/hooks/useWallet.tsx`, a React Context provider) is the single source of truth
for wallet state. It now exposes an explicit **`status: WalletConnectionStatus`** —
`DISCONNECTED | CONNECTING | CONNECTED | WRONG_NETWORK | ERROR` — derived from the lower-level
`address`/`isConnecting`/`isCorrectNetwork`/`error` flags, so UI and tests can switch on one value
instead of re-deriving it.

Handled explicitly:

- **Connect** — `eth_requestAccounts`, then `eth_chainId`.
- **Auto-restore** — `eth_accounts` (no prompt) on mount, so a page refresh doesn't force a
  reconnect if the wallet already authorized this site.
- **Account changed** — the injected provider's `accountsChanged` event updates `address` live; an
  empty array (the user disconnected all accounts in their wallet) clears state, matching
  "disconnect" handling.
- **Network changed** — `chainChanged` updates `chainId` live; `isCorrectNetwork` is recomputed
  against the configured chain's id.
- **Wallet-initiated disconnect** — the EIP-1193 `disconnect` event (emitted by some wallets on
  lock/revoke) clears local state the same way the app's own `disconnect()` does.
- **User rejected connection** — `eth_requestAccounts` rejecting with code `4001` (or a message
  matching "user rejected"/"user denied") is classified as `USER_REJECTED`, not a crash.
- **Unsupported wallet** — an injected provider that throws EIP-1193 code `4200` ("Unsupported
  Method") or an equivalent "not supported" message is classified as `UNSUPPORTED_WALLET`.

**Why EIP-1193 / MetaMask-compatible, not a GenLayer-specific wallet SDK**: unchanged from Phase 3 —
confirmed directly against genlayer-js's `ClientConfig.provider: EthereumProvider` shape, which is
exactly `window.ethereum`. A dedicated `genlayer-wallet` package exists as a possible future
enhancement but isn't required by the SDK.

Address display: `shortenAddress` (`0x1234…abcd`, Phase 3, unit-tested). Network display: the
connected wallet's `chainId` compared against the configured chain's `id`, with the expected
network's name/id shown, and a **Switch network** button that calls `switchToExpectedNetwork` —
never a silent send to the wrong network. Because a valid write client can still be constructed on
the wrong network (the SDK doesn't itself refuse this), every write path additionally gates its
submit button on `wallet.status === "CONNECTED"` (i.e. correct network), not just `isConnected`.

## Network Handling

`WalletStatus`/`WalletConnectButton` render the network state explicitly: connected-and-correct
shows the address and network name; wrong-network shows the required network name **and chain id**
plus a "Switch network" button (falls back gracefully if the wallet doesn't implement
`wallet_switchEthereumChain`/`wallet_addEthereumChain` — the promise simply rejects and the error is
shown, rather than the app pretending the switch worked). Every write call path is additionally
gated in the service layer itself (`requireContractAddress()` + `requireWriteClient()`), so even a
bypassed UI guard can't submit to the wrong place — there is exactly one configured contract address
per running instance of the app (`NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS`), and it belongs to
whichever chain `NEXT_PUBLIC_GENLAYER_NETWORK` selects.

## Transaction Lifecycle

`useTransaction<TResult>()` (`src/hooks/useTransaction.ts`) owns the shared status machine:
`IDLE -> WAITING_FOR_SIGNATURE -> SUBMITTING -> CONFIRMING -> SUCCESS | FAILED`. As of Phase 5, the
action passed to `run()` is a real `milestone.ts` call, whose `sendWriteTransaction` helper already
awaits GenLayer's `FINALIZED` status before resolving — so by the time `run()` reaches `CONFIRMING`,
the transaction has, in truth, already been confirmed; `CONFIRMING` is shown briefly for UX
consistency with the documented sequence, then `SUCCESS` reflects a genuinely finalized transaction,
never an optimistic guess. On failure, the real `AppError` (from `toAppError`, which now also
classifies blockchain-specific errors) is shown via `TransactionStatusBanner`, along with a link to
the connected network's block explorer (`chain.blockExplorers.default` — read directly from
genlayer-js's chain definition; the exact per-transaction URL path was not confirmed against a live
explorer in this environment, so the link goes to the explorer's base URL with the hash shown as
text to search, rather than guessing a deep-link path).

The **Create Milestone** flow is two steps, per the phase spec: a form step (with full client-side
validation via `validateMilestoneForm`) and a **Review Milestone** step showing every field plus the
full requirement list with an explicit "these become immutable once funded" notice, before the
transaction is ever submitted. The **Fund Escrow** flow on the milestone detail page follows the
same review-then-confirm pattern.

## Data Fetching

`useContractRead()` (Phase 3, unchanged) wraps any async read in `{ data, isLoading, error,
refetch }`. Every page that reads contract state (`MilestoneDetailView`, `EvaluationView`,
`DashboardPage`) now calls a real `milestone.ts` read function through it. Handled explicitly:

- **Loading** — `isLoading` is shown as a spinner everywhere a read is in flight.
- **Milestone doesn't exist** — `getMilestone` throws `MilestoneNotFoundError` when the contract's
  own "does not exist" error is detected, rendered as a specific, friendly notice rather than a
  generic failure.
- **No submission/evaluation yet** — `getSubmission`/`getEvaluation` return `null` (not an error)
  when the contract reports "no submission/evaluation exists yet", since that's an expected state
  (before `SUBMITTED`/before `APPROVED`|`REJECTED`), not a failure.
- **RPC failure / contract unavailable** — any other read error propagates as-is and is classified
  by `toAppError` (`RPC_ERROR` for network-shaped failures, `MISSING_ENV_VAR` if no contract address
  is configured, `UNKNOWN` otherwise) and rendered via `ErrorNotice`.
- **Stale data / refresh after a transaction** — never optimistic: `milestone.refetch()` is called
  only after a write's `useTransaction.run()` resolves successfully (i.e. after `FINALIZED`), so the
  UI's view of state always comes from a fresh, authoritative read — see "Optimistic UI" below.

**Parsing risk, disclosed**: the exact JSON shape a `@gl.public.view` method returns for an
`@allow_storage @dataclass` (field-keyed dict with snake_case keys, per every confirmed bundled
GenLayer example) has real, confirmed *precedent* but has never been observed live from this
environment for *this specific contract*. `milestone.ts`'s parsers assume snake_case keys matching
`contracts/workresolve.py`'s dataclass fields exactly, and are deliberately defensive (coercing
rather than throwing on an unexpected primitive) so a live-network shape mismatch, if one exists,
surfaces as a visible parsing issue rather than a silently wrong value.

## Event/Indexing Approach

**Decision: no event log, no database, no client-side "known ids" cache.** `contracts/workresolve.py`
has no confirmed custom-event API (`docs/contracts.md` "Known Limitations"), but it doesn't need one
for milestone enumeration: `get_milestones_by_client` / `get_milestones_by_freelancer` are real,
on-chain reverse-index view methods the contract itself maintains on every `create_milestone` call.
That is a simpler and more robust source of truth than any client-side indexer could be — no
separate infrastructure to run, and no risk of an index drifting out of sync with chain state. The
dashboard (`src/app/dashboard/page.tsx`) reads those two lists for the connected wallet, then reads
each milestone by id (`Promise.all`) to build its cards. If a future phase confirms a real
event-emission API, adding events would be a pure enhancement (e.g. faster dashboard loads at scale)
— it would not change this data model or require introducing a database now.

## Error Handling

Every catch block in the app funnels through `toAppError()` (`src/lib/utils/errors.ts`), which now
also calls `classifyBlockchainError()` (`lib/genlayer/errors.ts`) for anything blockchain-shaped.
Codes: `WALLET_NOT_CONNECTED`, `WRONG_NETWORK`, `USER_REJECTED`, `UNSUPPORTED_WALLET`,
`INSUFFICIENT_BALANCE`, `INVALID_ADDRESS`, `INVALID_INPUT`, `INVALID_STATE`, `MILESTONE_NOT_FOUND`,
`TRANSACTION_FAILED`, `TRANSACTION_TIMEOUT`, `CONTRACT_ERROR`, `RPC_ERROR`, `MISSING_ENV_VAR`,
`GENLAYER_UNAVAILABLE`, `NOT_IMPLEMENTED`, `UNKNOWN`. A contract revert's raw reason (e.g. "Payment
has already been released for this milestone.") is mapped through `friendlyRevertMessage` to
already-friendly text (unchanged in that specific case — the contract's own messages are already
short and clear — but generic/unmapped reverts still get a truncated, readable fallback rather than
a raw stack trace). The original error is always preserved on `AppError.cause` for
`logDevError`-only development logging, never rendered to the user.

## Security

See **`docs/security.md`** for the full Phase 7 audit (contract + frontend + evaluation, with
severity ratings and stated residual risk). The summary that mattered from day one still applies
unchanged: **frontend validation is UX only.** `validateMilestoneForm` and every inline check in `MilestoneDetailView`
(e.g. "only the client can fund") exist to give a fast, clear message before a wallet prompt even
opens — they are not what makes the app safe. The contract re-validates every one of these
conditions itself (`docs/contracts.md` "Security Threat Model"), and every value the frontend reads
back (milestone state, amounts, requirement weights, addresses) comes from `getMilestone`/etc., i.e.
from GenLayer directly — never from a URL parameter, local component state, or anything
client-entered being treated as authoritative.

## No Fake Data

No function in `src/lib/genlayer/milestone.ts` returns a fabricated value: every write returns
exactly the hash `writeContract` resolved with (never a client-generated placeholder), and every
read returns exactly what `readContract` returned, parsed but not invented. The dashboard's stat
tiles show an em dash while disconnected or loading and a real on-chain count otherwise — never a
zero or placeholder number presented as data. The one static, clearly-labeled example content that
remains is the landing page's marketing copy (`src/app/page.tsx`, unchanged from Phase 3), which was
never wired to live data in the first place.

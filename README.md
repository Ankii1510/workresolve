# WorkResolve

Decentralized escrow for freelance milestones, evaluated by [GenLayer](https://www.genlayer.com)'s
Intelligent Contracts and decentralized validator consensus — instead of a single centralized
"approve" button.

> **Status: v0.1.0-testnet.** The contract is deployed and live on **two** GenLayer networks — the
> hosted Studio network (the app's default) and the Asimov Testnet — and the frontend is publicly
> live at https://workresolve.vercel.app/ with an in-app network switcher. See "Networks" below for
> both addresses. A milestone has been created and funded on Studio against the live contract; the
> APPROVE/REJECT half of the lifecycle has not been completed end to end yet — see "Limitations"
> below for exactly what that means. See `docs/release-notes.md` for the full version history.

## Problem

Freelance milestone disputes — "is this work actually done" — are usually resolved one of three
ways: a centralized platform's support team makes the call, the two parties argue it out directly,
or nobody resolves it and one side simply loses out. None of these are decentralized, and none of
them are grounded in an actual evaluation of the delivered evidence.

## Solution

WorkResolve locks payment into an on-chain escrow contract whose release decision comes from
GenLayer's Intelligent Contracts rather than either party or a platform. A client and freelancer
agree on structured, weighted requirements up front; those become immutable the moment escrow is
funded. When the freelancer submits evidence — a deployed URL, a repository, supporting links —
GenLayer's validators fetch and evaluate that evidence against the original requirements and must
reach consensus on a structured result before it's finalized. A plain, deterministic contract then
reads that result and automatically releases payment or refunds the client — no manual "approve"
step, and no AI code path with direct control over funds.

## Why GenLayer

A conventional deterministic smart contract cannot natively read and judge a live website or
repository: every validator must compute the exact same output from the exact same input, and
"does this page look responsive" isn't a deterministic function of on-chain state. Without GenLayer,
a project with WorkResolve's requirements has two options, both worse: a centralized oracle or
backend performs the evaluation off-chain and the contract simply trusts its report (reintroducing
the single point of trust escrow was supposed to remove), or evaluation is skipped and settlement
falls back to manual attestation (the exact centralized-platform problem this project exists to
avoid). GenLayer's Intelligent Contracts let the evaluation itself be decentralized — independent
validators, consensus-gated — instead of centralized or absent. Full technical explanation, with
exact contract methods and prompt structure: [`docs/genlayer-integration.md`](./docs/genlayer-integration.md).

## How It Works

```
Create  ->  Fund  ->  Accept  ->  Submit  ->  Evaluate  ->  Consensus  ->  Settle
```

1. **Create** — client defines a milestone: title, description, payment amount, deadline, and
   weighted requirements (`/milestones/new`).
2. **Fund** — client locks the agreed amount into escrow. Requirements become immutable from this
   point on, committed on-chain by hash.
3. **Accept** — the assigned freelancer accepts the funded milestone.
4. **Submit** — the freelancer submits evidence (a deployed URL, a repository URL, and/or evidence
   links) against the original, immutable requirements.
5. **Evaluate** — anyone (permissionless by design) triggers GenLayer's real evaluation; the
   Intelligent Contract fetches the evidence and runs it through GenLayer's LLM-backed evaluator,
   under an explicit prompt hierarchy that treats all fetched content as untrusted evidence, never
   as instructions.
6. **Consensus** — independent GenLayer validators must agree on the same structured,
   per-requirement result (PASS/FAIL/PARTIAL/UNVERIFIABLE per requirement) before it's finalized
   on-chain.
7. **Settle** — the finalized decision (computed deterministically from validated statuses only,
   never from the evaluator's own stated opinion) unlocks either **Release Payment** (APPROVE) or
   **Refund Client** (REJECT), each a real, explicitly wallet-signed transaction.

## Architecture

```
Frontend (Next.js, wallet-connected)
    |
GenLayer client (genlayer-js)
    |
Intelligent Contract (contracts/workresolve.py)
    |
    +-- Escrow + state machine (deterministic)
    +-- evaluate_and_finalize (non-deterministic: GenLayer evaluation + consensus)
    |
Settlement (deterministic release/refund)
```

Only `evaluate_and_finalize` is GenLayer-dependent (non-deterministic, LLM + consensus); every
other contract method — create, fund, accept, submit, release, refund, cancel — is ordinary,
fully-deterministic logic. See [`docs/architecture.md`](./docs/architecture.md) for the full design
and [`docs/contracts.md`](./docs/contracts.md) for the complete state-transition table.

## Features

Only what's actually implemented and tested:

- Weighted, immutable milestone requirements, committed on-chain by hash at funding time.
- Real escrow funding, acceptance, submission, and settlement — every write is a real
  `genlayer-js` transaction; no mock layer anywhere in a user-facing path.
- Permissionless GenLayer evaluation with an explicit prompt-injection defense: submitted evidence
  is always treated as untrusted content, never as instructions (five dedicated tests exercise this
  boundary — see [`docs/evaluation.md`](./docs/evaluation.md)).
- Consensus-gated, structured per-requirement results (PASS/FAIL/PARTIAL/UNVERIFIABLE) with concise
  explanations, never raw chain-of-thought.
- On-chain-derived reputation (`/profile`) with a documented, non-manual formula.
- A local, per-wallet transaction/activity log with real explorer links — explicitly documented as
  a per-browser record, not a full cross-device ledger.
- In-app toast notifications for every confirmed transaction; deadline awareness
  (Due soon/Deadline passed) that never overrides the contract's own authority.
- A full transaction-lifecycle UI (waiting for signature → submitting → confirming → confirmed)
  that never shows success before real on-chain confirmation.
- A verified production Content-Security-Policy and security headers (see
  [`docs/security.md`](./docs/security.md)).
- Global error boundaries, blockchain-specific error classification, and graceful wallet/network
  edge-case handling (disconnect, account switch, network switch, locked wallet, missing
  extension).

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, React 19.
- **Blockchain client**: `genlayer-js@1.1.8` — the only place this app talks to GenLayer.
- **Contract**: a Python GenLayer Intelligent Contract (`contracts/workresolve.py`), with a
  pure-Python, independently-testable mirror of its deterministic core
  (`contracts/logic/workresolve_logic.py`).
- **Testing**: Vitest + Testing Library (frontend), pytest (contract logic).
- **No backend server, no database, no indexer** — the dashboard and profile read directly from the
  contract's own reverse-index views; see [`docs/frontend.md`](./docs/frontend.md) "Event/Indexing
  Approach" for why that was a deliberate choice, not a gap.

## Networks

The app ships with an in-app network switcher (`src/components/layout/NetworkSwitcher.tsx`). It
offers only networks that actually have a contract address configured for the build, so a menu
entry never leads to a "not deployed" dead end. **A contract deployed on one network does not exist
on any other** — each network below has its own permanent address.

**GenLayer Studio Network** (`studionet`, chain id `61999`) — the app's default.

- **Contract**: `0xdD0b1E30D7934845D9B91633bDAD21fBF7A83a2e`
- **Explorer**: https://explorer-studio.genlayer.com/address/0xdD0b1E30D7934845D9B91633bDAD21fBF7A83a2e
- **Deployment transaction**: `0x08290ecb9002bfabb67d1cec1038deb38419dd6c3954adb15fc57541e732dc2b`
  (GenVM result SUCCESS, consensus Accepted), deployed with
  [`scripts/deploy-contract.mjs`](./scripts/deploy-contract.mjs), which takes the network as an
  explicit argument and then verifies from the receipt's own shape that it landed on the intended
  one — see `docs/limitations.md` for the day that check was written to prevent.

**GenLayer Asimov Testnet** (`testnetAsimov`, chain id `4221`) — the real, decentralized testnet.

- **Contract**: `0x14255277822815F43DA58271d8d28f0F844cf209`
- **Explorer**: https://explorer-asimov.genlayer.com/address/0x14255277822815F43DA58271d8d28f0F844cf209
- **Deployment transaction**: `0x85b326bb39ee766cb6f932ce9a098fbb37b158724f40184d268d4543b645f30a`.
  This was the fourth deployment attempt: three prior addresses
  (`0x9F3B3360a4219A276ba76600e1CCD7B924eDC6C0`, `0x7BB7A6D936Fd72149424AE3681304dBc4E575B79`,
  `0x8366417A85498fF3Ff8012E85Ab2DE7d6FE83b16`) each reported success but never actually finished
  deploying — two GenVM-level bugs in the contract's own header comment, root-caused with
  `genlayer receipt` / `genlayer trace`; see `docs/limitations.md`.

Both are confirmed live via `genlayer code`, which returns the contract's actual source. The
contract is upgradeable (`upgrade()`), so a code fix is pushed to these same addresses with
[`scripts/upgrade-contract.mjs`](./scripts/upgrade-contract.mjs) rather than redeployed — no address
in this project should need reissuing again.

- **Frontend**: live at https://workresolve.vercel.app/, deployed on Vercel, with each network's
  address supplied by its own `NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_*` variable (below).

## Getting Started

### Prerequisites

Node.js 20+, npm, Python 3.10+ (for the contract's test suite only — the contract itself runs on
GenVM, not local Python, once deployed).

### Installation

```bash
git clone <this-repository>
cd workresolve
npm install
```

### Environment variables

Copy `.env.example` to `.env.local` and fill in what you need:

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_GENLAYER_NETWORK` — one of `localnet`, `studionet`, `testnetAsimov`,
  `testnetBradbury`. This is only the *seed* default for a first-time visitor: once someone picks a
  network in the in-app switcher, that choice is stored in their browser and wins. Defaults to
  `studionet` (hosted simulator, no local setup) if unset.
- `NEXT_PUBLIC_GENLAYER_RPC_URL` — optional override for the network's default RPC endpoint.
- `NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_STUDIONET`,
  `NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_TESTNET_ASIMOV`,
  `NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_TESTNET_BRADBURY`,
  `NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_LOCALNET` — each network's own deployed address. A
  network with no address set simply does not appear in the switcher. Left unset entirely, the app
  still runs and is fully browsable; any action that needs the contract shows a clear
  "not configured" error instead of crashing or faking a result.
- `NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS` — legacy, unsuffixed, kept working as a fallback for
  `testnetAsimov` only.

> Put a network's address only in *that* network's variable. Nothing fails at build time if you
> mix them up, reads can keep working against whichever network the address really belongs to, and
> some wallets report the resulting write failure as nothing more useful than "an internal error" —
> `docs/limitations.md` has the day that cost. Confirm an address on its own network's explorer
> before pasting it anywhere.

> Next.js inlines `NEXT_PUBLIC_*` variables at **build** time. Adding or changing one on Vercel has
> no effect until a new deployment is built.

Every `NEXT_PUBLIC_*` variable above is safe to expose to the browser by design — none of them is a
secret. No variable in this project should ever hold a private key, seed phrase, or API secret; see
`SECURITY.md`.

### Run locally

```bash
npm run dev       # development server
npm run build     # production build
npm start         # run the production build locally
```

## Testing

```bash
npm run lint            # ESLint
npm run typecheck       # TypeScript
npm run test            # frontend unit tests (Vitest)
cd contracts && python3 -m pytest tests_logic -v   # contract logic tests (pytest)
```

Current results: 152/152 frontend unit tests passing, 94/94 contract logic tests passing (including
a dedicated prompt-injection defense suite and full URL-scheme/malformed-evaluation coverage — see
`docs/security.md`).

## Security

Full audit (contract, frontend, GenLayer evaluation, severity-rated): [`docs/security.md`](./docs/security.md).
Security assumptions and responsible disclosure: [`SECURITY.md`](./SECURITY.md). Summary: no
private keys or secrets are ever requested or stored by this app; every submitted evidence URL is
scheme-validated (http/https only) at both the contract and frontend layers; every evaluation
payload is validated against a fixed schema, with the evaluator's own stated score/decision never
read; a verified production CSP and security headers are in place. **This contract has not been
formally, independently audited** — see `SECURITY.md` "Audit status."

## Limitations

Full, current, honest list: [`docs/limitations.md`](./docs/limitations.md). Headline items: no live
deployment exists yet (no reachable Docker daemon or GenLayer testnet network egress in this
project's build environment); GenLayer's AI evaluation is probabilistic, not a legal judgment;
submitted evidence can disappear or change after submission; transaction/activity history is a
local, per-browser log, not a full cross-device ledger; no dispute or appeals mechanism exists
beyond the evaluation itself; testnet only, never mainnet.

## Roadmap

Deliberately out of scope for this release (see `docs/release-notes.md` "Feature freeze"): a real
testnet deployment and public frontend launch, decentralized file storage for evidence, a
dispute/appeals layer, multi-milestone contracts, partial releases. Explicitly **not** planned
regardless of future phase: token mechanics, NFTs, DAO governance, a marketplace, additional AI
agents, social features, more elaborate reputation mechanics, a centralized AI fallback for the core
evaluation, or new backend infrastructure — WorkResolve is meant to stay a focused escrow +
decentralized-evaluation product, not to accumulate unrelated features.

## Documentation index

- [`docs/architecture.md`](./docs/architecture.md) — full system architecture, state machine, data
  model, threat model, MVP scope.
- [`docs/contracts.md`](./docs/contracts.md) — the Intelligent Contract itself: state transitions,
  escrow model, security review, known limitations.
- [`docs/frontend.md`](./docs/frontend.md) — wallet architecture, blockchain service layer,
  transaction lifecycle, error handling.
- [`docs/evaluation.md`](./docs/evaluation.md) — the GenLayer evaluation flow end to end, including
  prompt injection defense.
- [`docs/genlayer-integration.md`](./docs/genlayer-integration.md) — why this project needs
  GenLayer specifically, and how to verify that.
- [`docs/security.md`](./docs/security.md) — full severity-rated security audit.
- [`docs/limitations.md`](./docs/limitations.md) — honest, current limitations list.
- [`docs/demo.md`](./docs/demo.md) / [`docs/demo-video-script.md`](./docs/demo-video-script.md) —
  demo script and video script.
- [`docs/project-description.md`](./docs/project-description.md) /
  [`docs/pitch.md`](./docs/pitch.md) — short/medium/long descriptions and pitch scripts.
- [`docs/submission.md`](./docs/submission.md) — GenLayer ecosystem submission package.
- [`docs/release-notes.md`](./docs/release-notes.md) — version history and feature freeze.
- [`docs/release-checklist.md`](./docs/release-checklist.md) /
  [`docs/final-release-checklist.md`](./docs/final-release-checklist.md) — box-by-box release
  readiness.
- `contracts/README.md` — how to run the contract's own test suite.

## License

[MIT](./LICENSE).

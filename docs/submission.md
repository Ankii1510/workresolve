# Submission Package

**Completeness note, stated up front**: the contract is deployed to GenLayer's public Asimov
Testnet and the frontend is publicly live on Vercel (see "Contract" and "Live Demo" below) — this
package is no longer deployment-incomplete. The one thing still outstanding is a real, end-to-end
two-wallet APPROVE/REJECT lifecycle recorded against the live contract; that section below remains
marked accordingly rather than filled with an invented value — see `docs/limitations.md` and
`docs/release-notes.md` "Blockers to v1.0.0."

## Project Name

WorkResolve

## Category

Not specified here — GenLayer's current submission platform/category taxonomy was not looked up as
part of this phase (this project has no live network access to check current hackathon/ecosystem
program pages against). Confirm the current category list against GenLayer's own
submission/ecosystem page before submitting, rather than guessing one here.

## One-liner

Decentralized escrow for freelance milestones, evaluated by GenLayer's Intelligent Contracts and
decentralized validator consensus instead of a single centralized "approve" button.

## Problem

Freelance milestone disputes — "is this work actually done" — are typically resolved by a
centralized platform's support team, by the two parties arguing it out directly, or not at all.
None of these are decentralized or evidence-based.

## Solution

An on-chain escrow contract where the release decision comes from GenLayer's Intelligent
Contracts: independent validators fetch the freelancer's submitted evidence, evaluate it against
requirements fixed before the work started, and must reach consensus before a deterministic
settlement step releases or refunds funds. See `docs/project-description.md` for the full-length
version.

## Why GenLayer

A conventional deterministic contract cannot read and judge a live webpage or repository against
requirements — every validator must compute the same result from the same input, and "is this
responsive" isn't a deterministic function. GenLayer's non-deterministic, consensus-backed
execution model is the only part of the stack that can do this without reintroducing a centralized
oracle. Full technical explanation: `docs/genlayer-integration.md`.

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

Full detail: `docs/architecture.md`, `docs/contracts.md` (includes the complete state-transition
table).

## Tech Stack

Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 on the frontend; `genlayer-js@1.1.8` as the
only blockchain client library; a Python GenLayer Intelligent Contract
(`contracts/workresolve.py`); Vitest + Testing Library for frontend tests; pytest for the
contract's deterministic-logic test suite. No backend server, no database, no indexer — see
`docs/frontend.md` "Event/Indexing Approach" for why.

## Key Features

Weighted, immutable milestone requirements committed by hash; real escrow funding and settlement
through GenLayer's own documented native-transfer API; a deadline that gates both submission and
cancellation, so a client can always recover a stalled milestone; permissionless GenLayer evaluation
with an explicit prompt-injection defense (evidence is always treated as untrusted content, never as
instructions); consensus-gated, structured per-requirement results; on-chain-derived reputation with
a documented formula; a local per-wallet transaction/activity log; a full transaction-lifecycle UI
(never shows success before real confirmation, and never confuses an unresolved confirmation wait
with an actual on-chain failure); a verified production CSP and security headers; EIP-6963
multi-wallet discovery (no single vendor's wallet hardcoded); 246 passing tests across the frontend
and contract layers.

## Live Demo

https://workresolve.vercel.app/ — deployed on Vercel, pointed at the deployed contract (see
"Contract" below). A real, end-to-end two-wallet APPROVE/REJECT lifecycle has not been run against
it yet; the static `/demo` page walks through the flow with clearly labeled illustrative examples
in the meantime.

## Repository

https://github.com/Ankii1510/workresolve

## Contract

**Deployed, redeployment pending.** Network: GenLayer Asimov Testnet (`testnet-asimov`, chain id
`4221`). The address and transaction below are the *original* deployment: `0x9F3B3360a4219A276ba76600e1CCD7B924eDC6C0`,
tx `0xbcb13223a03a32a23adf217727adcc6884002d08c2e98c44fbebf2a19ced72dc`. Explorer:
https://explorer-asimov.genlayer.com/. Following reviewer feedback on the initial submission, three
fixes were made to `contracts/workresolve.py`: the native-currency transfer mechanism now matches
GenLayer's own documented API (see `docs/contracts.md` "Escrow Architecture"); `submit_work` rejects
any submission made after a milestone's deadline, preserving the client's cancellation right; and the
contract now opts into GenLayer's own upgradability mechanism (see `docs/contracts.md`
"Upgradability") so that no future fix needs another redeployment. Because none of this can take
effect on an already-deployed contract, a fresh deployment is required and pending — this section
will be updated with the new address once it happens. See `docs/release-notes.md` "Post-launch
fixes" and "Blockers to v1.0.0" for the full explanation and remaining status (a real, end-to-end
two-wallet APPROVE/REJECT lifecycle, and a live-network run of the deterministic funded-lifecycle
refund tests, both against the new deployment).

## Testnet

Network: GenLayer Asimov Testnet (`testnet-asimov`, chain id `4221`) per
`src/lib/genlayer/config.ts`. The contract above is deployed on this network. A real, two-wallet
APPROVE flow and REJECT flow against it have not been run yet.

## Demo Video

**Not yet recorded.** Script ready: `docs/demo-video-script.md`.

## Screenshots

**Not yet captured** (requires a live deployment to capture honestly). Shot list ready:
`docs/demo-video-script.md` "Screenshot list."

## Security

Full audit: `docs/security.md`. Disclosure policy: `SECURITY.md`. Not formally, independently
audited — this project's own test suite and manual review only. Testnet-only; never send real funds
to any deployment of this contract.

## Limitations

Full list: `docs/limitations.md`. Headline items: no real, end-to-end APPROVE/REJECT lifecycle has
been run against the live contract yet; the now-corrected native-transfer mechanism has not yet been
exercised against the live deployment (deterministic tests for it exist and are ready to run — see
`docs/contracts.md` "Known Limitations"); AI evaluation is probabilistic, not a legal judgment;
external evidence can disappear after submission; no dispute/appeals mechanism beyond the
evaluation itself; transaction history is a local per-browser log, not a cross-device ledger.

## Future Roadmap

See `README.md` "Roadmap" for the full list. Deliberately excluded from this release (see Phase 9
section 34): tokens, NFTs, DAO governance, a marketplace, additional AI agents, social features,
more elaborate reputation mechanics, a centralized AI fallback for evaluation, and new backend
infrastructure — all plausible future directions, none of them part of this submission.

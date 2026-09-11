# Submission Package

**Completeness note, stated up front**: the contract is deployed to GenLayer's public Asimov
Testnet and the frontend is publicly live on Vercel (see "Contract" and "Live Demo" below) — this
package is no longer deployment-incomplete. A real, end-to-end **two-wallet REJECT lifecycle** has
now been run against the live Studio deployment, ending in a refund — see "Live Demo" below for the
recorded run. The APPROVE half (a passing evaluation followed by `release_payment`) has still not
been run; that remains marked as unproven rather than filled with an invented value — see
`docs/limitations.md` and `docs/release-notes.md` "Blockers to v1.0.0."

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
"Contract" below).

**Recorded live run — milestone #1 on GenLayer Studio (2026-09-11).** Every step below was signed
by a real wallet against the live contract `0xdD0b1E30D7934845D9B91633bDAD21fBF7A83a2e`, using two
distinct accounts: client `0x009a88638467af8ca34f775dd3f5c5763e2b97a6` and freelancer
`0x4d3d7023479bf78a3181aefaec977b71202619ff`. The contract itself enforces that these differ, and
that `submit_work` is signed by the freelancer, so this is genuinely a two-wallet run.

| Step | Recorded |
| --- | --- |
| `create_milestone` (client) | 14:59:01 |
| `fund_milestone` (client, 20 GEN into escrow) | 14:59:58 |
| `accept_milestone` (freelancer) | 15:14:07 |
| `submit_work` (freelancer) | 15:17:48 |
| `evaluate_and_finalize` — **REJECT** | 15:53:11 |
| `refund_client` — escrow returned | state `REFUNDED` |

The evaluation step is the one that matters most here: it ran GenLayer's real validator consensus
over an LLM judgment (the validators on this network run Claude Sonnet, GPT, Gemini, Qwen and Kimi
under per-validator model policies), returned a REJECT verdict, and the contract then moved the
escrow on its own — no human approval button anywhere in the path.

Still not run: the **APPROVE** half (a passing evaluation followed by `release_payment`). And note
that what is proven above is the contract's own state reaching `REFUNDED` with `refunded = True`
after `_pay_out()` returned without reverting — whether the GEN then credited to the client's wallet
*balance* on Studio specifically is a separate question, since GenLayer's docs note Studio simulates
balances without a full EVM layer. See `docs/limitations.md`.

The static `/demo` page still walks through the flow with clearly labeled illustrative examples for
anyone who wants the narrated version.

## Repository

https://github.com/Ankii1510/workresolve

## Contract

**Deployed and verified genuinely live.** Network: GenLayer Asimov Testnet (`testnet-asimov`, chain
id `4221`). Address: `0x14255277822815F43DA58271d8d28f0F844cf209`. Deployment transaction:
`0x85b326bb39ee766cb6f932ce9a098fbb37b158724f40184d268d4543b645f30a`. Explorer:
https://explorer-asimov.genlayer.com/. This is the fourth deployment addressing reviewer feedback on
the initial submission: the native-currency transfer mechanism now matches GenLayer's own documented
API (see `docs/contracts.md` "Escrow Architecture"); `submit_work` rejects any submission made after
a milestone's deadline, preserving the client's cancellation right; and the contract now opts into
GenLayer's own upgradability mechanism (see `docs/contracts.md` "Upgradability") so that no future
fix needs another redeployment. Three prior addresses
(`0x9F3B3360a4219A276ba76600e1CCD7B924eDC6C0`, `0x7BB7A6D936Fd72149424AE3681304dBc4E575B79`,
`0x8366417A85498fF3Ff8012E85Ab2DE7d6FE83b16`) are superseded and permanently dead — each looked like
a normal deploy success but never actually finished, due to two separate GenVM-level bugs in this
file's own header comment (root-caused with `genlayer receipt`/`genlayer trace`, see
`docs/limitations.md`). This deployment is confirmed live via `genlayer code`, which returns the
contract's actual source rather than a "code not found" error. See `docs/release-notes.md`
"Post-launch fixes" and "Blockers to v1.0.0" for the full explanation and remaining status.

## Networks

The app has an in-app network switcher and is deployed on two GenLayer networks, each with its own
permanent address (a contract on one network does not exist on another):

- **GenLayer Studio Network** (`studionet`, chain id `61999`) — the default.
  `0xdD0b1E30D7934845D9B91633bDAD21fBF7A83a2e`. This is where the recorded two-wallet REJECT
  lifecycle above was run.
- **GenLayer Asimov Testnet** (`testnetAsimov`, chain id `4221`).
  `0x14255277822815F43DA58271d8d28f0F844cf209`. No full lifecycle has been run here.

Both are upgradeable, so fixes are pushed to these same addresses via
`scripts/upgrade-contract.mjs` rather than redeployed.

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

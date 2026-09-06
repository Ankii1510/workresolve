# Demo Guide

This is the checklist and script for demonstrating WorkResolve on a real GenLayer testnet. It
assumes the contract has already been deployed somewhere with real network access (this
development sandbox has never had that — see "Environment note" at the bottom).

## What you need

- **Network**: `testnetAsimov` (chain id `4221`, `https://rpc-asimov.genlayer.com`) is the default
  and recommended network — see `src/lib/genlayer/config.ts` for why, and re-verify against
  https://docs.genlayer.com before the demo, since GenLayer's "current" public testnet has changed
  identity before (Phase 1 finding, still true as of this phase).
- **Two wallets**: any EIP-1193-compatible browser wallet (e.g. MetaMask) configured for the
  GenLayer testnet above. Wallet A plays the client, Wallet B plays the freelancer.
- **Testnet funds** in both wallets. Check GenLayer's current documentation
  (https://docs.genlayer.com) for the active faucet — this has changed across phases and should
  not be assumed from this document.
- **A deployed WorkResolve contract address**, set as `NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS` in
  `.env.local`. There is no address to publish here yet — see "Environment note" below.
- **The app running** against that configuration: `npm install && npm run build && npm start` (or
  `npm run dev` for a non-production run).

## Setting up test wallets

If you don't want to use a personal wallet for the demo, create two fresh accounts in your wallet
extension (MetaMask: "Add account" — this generates a new key pair locally, no seed phrase needed
beyond the wallet's own). Fund each from the testnet faucet separately. Never use, request, or
publish a private key or seed phrase for a demo — a freshly generated, disposable testnet account
needs neither.

## The demo script (3-5 minutes)

Timings are a guide, not a hard requirement — GenLayer consensus latency (the "GenLayer evaluates"
step) is the one stage that can genuinely vary.

**0:00 — The problem.** "Freelance milestone payments are usually settled by one side's word
against the other's — a platform support agent, or nothing at all. WorkResolve puts the money in
an on-chain escrow and has GenLayer's validator network read the actual submitted evidence against
the requirements the client and freelancer agreed to up front, before either side could see the
work — and settles automatically based on that."

**0:30 — Create milestone.** As Wallet A (client), go to `/milestones/new`. Fill in a project
title, the freelancer's address (Wallet B), an amount, a deadline, and 3-5 concrete requirements
with weights summing to 100 (e.g. "Responsive homepage" 40, "Working contact form" 30, "Deployed
and reachable" 30). Show the Review step's explicit "these become immutable once funded" notice
before submitting.

**1:00 — Fund escrow.** Still as Wallet A, open the created milestone and use "Fund Escrow." Show
the transaction lifecycle banner (Waiting for signature → Submitting → Confirming → Confirmed) and
the resulting `FUNDED` state.

**1:30 — Freelancer accepts and submits.** Switch to Wallet B. Accept the milestone, then go to the
submit page and fill in a deployed URL and/or repository URL that genuinely satisfies the
requirements. Show the Submission Review step, then submit.

**2:00 — GenLayer evaluates.** Trigger evaluation from the milestone's Evaluation tab (either
wallet may call it — the method is permissionless by design, see `docs/evaluation.md`). Show the
consensus-stage timeline (Submission Received → Evaluation Started → GenLayer Validators
Evaluating → Consensus Reached → Evaluation Finalized) updating as it progresses.

**2:30 — Consensus result.** Show the finalized per-requirement PASS/FAIL/PARTIAL/UNVERIFIABLE
breakdown, the overall score, and the APPROVE/REJECT decision — point out that none of this is
frontend-computed; it's read directly from the finalized on-chain evaluation.

**3:00 — Payment or refund.** If APPROVE: click "Release Payment" and show Wallet B's balance
increase by the milestone amount. If REJECT: click "Refund Client" and show Wallet A's balance
increase instead. Either way, point out the transaction banner never claims success before
GenLayer's own confirmation.

**3:30 — On-chain history.** Open `/profile` for whichever wallet is connected: show the reputation
score and outcome counts update, and the "Recent activity" list showing the real transaction hash
with a working link to the network's block explorer.

## What NOT to do in a demo

- Never fabricate a transaction, a score, or a validator count to "keep the demo moving" if a step
  is slow or fails — GenLayer consensus latency is real and should be shown as real, including a
  brief wait if that's what happens. See docs/evaluation.md "No Fake Evaluation."
- Never mix `/demo`'s static illustrative walkthrough into a live-wallet demo session — they are
  deliberately, visibly distinct (`/demo` is labeled "DEMO — illustrative walkthrough, not a live
  transaction").
- Never demo with a wallet holding funds you can't afford to lose — this is a public testnet, not a
  sandboxed simulation, once a real deployment exists.

## Environment note (honest, re-confirmed this phase)

This development environment has no reachable Docker daemon and no network egress to any
`genlayer.com` host (re-checked at the start of Phase 8 with a live `curl`, same result as every
prior phase). No contract has been deployed from here, so there is no real contract address,
faucet status, or transaction reference to publish in this document yet. Once a deployment exists
in an environment with real network access, this file should be updated with: the actual deployed
contract address, the exact faucet URL used, and the transaction hashes from the most recent
successful demo run (both an APPROVE and a REJECT scenario) — see `docs/limitations.md` for the
full list of what this implies.

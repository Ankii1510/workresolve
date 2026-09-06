# Demo Video Script

Target length: 3-5 minutes. The center of gravity is the middle of the video — work submitted,
GenLayer evaluates, consensus, settlement — not wallet setup. Budget roughly: 45s problem/setup,
90s create+fund+submit, 90s evaluation+consensus, 45s settlement+proof. Adapt exact timings to
whatever the actual GenLayer consensus latency turns out to be on the day of recording — do not
pad or fake the wait; a real few-seconds-to-tens-of-seconds pause while validators reach consensus
is worth showing, not cutting around.

This assumes a real deployment exists and two funded testnet wallets are ready — see `docs/demo.md`
for the setup steps this script assumes are already done before recording starts.

## Screen-by-screen script

**[0:00-0:30] Problem — landing page, no wallet connected**
Screen: `/` (landing page), scrolled to the Trust & Transparency section.
Narration: "Freelance milestone disputes are usually settled by one side's word, a platform support
agent, or nothing at all. WorkResolve puts payment into on-chain escrow and has GenLayer's
decentralized validator network decide whether the work actually meets what was agreed — not a
person, not a single company."
Do NOT claim: "fully autonomous," "trustless," or that this replaces legal recourse. Do say:
GenLayer's evaluation is one part of the system; the escrow/state machine around it is ordinary,
deterministic, auditable code.

**[0:30-1:00] Create milestone — Wallet A (client)**
Screen: `/milestones/new`, filled out live on camera (title, freelancer address = Wallet B, amount,
deadline, 3-5 requirements with weights summing to 100).
Narration: "As the client, I define exactly what 'done' means up front — concrete, weighted
requirements. The Review step shows these become immutable the moment I fund escrow — neither of us
can move the goalposts after this point."
Show: the Review Milestone step's immutability notice, then the transaction lifecycle banner
through to confirmation.

**[1:00-1:20] Fund escrow — Wallet A**
Screen: milestone detail page, "Fund Escrow."
Narration: "Funding locks the agreed amount into the contract. From here, the requirements are
locked too."
Show: the FUNDED state and the escrow amount reflected on the page.

**[1:20-2:00] Freelancer accepts and submits — Wallet B**
Screen: switch wallet, accept the milestone, go to the submit page, fill in a deployed URL and
repository, submit.
Narration: "As the freelancer, I accept and submit real evidence — a deployed site, a repository.
This is exactly what GenLayer's validators will look at."
Show: the Submission Review step, then the confirmed `SUBMITTED` state.

**[2:00-2:30] GenLayer evaluates**
Screen: the Evaluation tab, "Start Evaluation" clicked.
Narration: "This is the part a normal smart contract can't do. GenLayer's Intelligent Contract
fetches that evidence and has independent validators evaluate it against the original requirements
— not my opinion, not the freelancer's, a decentralized network's consensus."
Show: the consensus-stage timeline advancing in real time (Submission Received → Evaluation Started
→ Validators Evaluating → Consensus Reached → Finalized). If this takes longer than expected on the
day, let it run — narrate over the wait rather than cutting to a fake instant result.

**[2:30-3:00] Consensus result**
Screen: the finalized evaluation view — per-requirement PASS/FAIL/PARTIAL/UNVERIFIABLE breakdown,
overall score, decision.
Narration: "The result is a real, finalized on-chain record — every requirement judged
individually, with a short explanation for each, not a black-box yes/no."
Do NOT claim: "100% accurate." Do say: this is a probabilistic evaluation of real evidence, which is
exactly why the REJECT case (see below, or as a separate cut) matters as proof this isn't just an
approval machine.

**[3:00-3:30] Settlement**
Screen: "Release Payment" (if APPROVE) or "Refund Client" (if REJECT) clicked; the receiving
wallet's balance updates.
Narration: "The decision alone doesn't move money — a plain, deterministic contract reads the
finalized result and either releases payment or refunds the client. No AI touches funds directly."

**[3:30-4:00] On-chain proof**
Screen: `/profile`'s "Recent activity" list, click through an explorer link.
Narration: "Every step of this — creation, funding, submission, evaluation, settlement — is a real,
independently verifiable transaction. Here's the actual explorer record."

## What NOT to claim, anywhere in the video

- Not "fully autonomous" — a human explicitly signs every transaction; nothing executes without
  wallet approval.
- Not "100% accurate" or "always correct" — GenLayer's evaluation is a probabilistic judgment.
- Not "trustless" — the system trusts GenLayer's validator consensus and the connected wallet's
  integrity, stated plainly rather than glossed over.
- Not "legally binding arbitration" — WorkResolve settles funds according to its own on-chain logic;
  it makes no legal claim.
- Not "decentralized" for anything that isn't — the frontend hosting, for instance, is an ordinary
  centralized web deployment; only the contract, escrow, and evaluation consensus are decentralized,
  and the video should be precise about which is which.

## Screenshot list (capture from the actual running application — never mock these up)

1. Landing page (`/`), hero + Trust & Transparency section.
2. Dashboard (`/dashboard`) with at least one real milestone visible per role (as client / as
   freelancer).
3. Create Milestone (`/milestones/new`) — the Review step showing the immutability notice.
4. Fund Escrow — the milestone detail page's Fund Escrow confirm step and the resulting FUNDED
   state.
5. Freelancer submission (`/milestones/[id]/submit`) — the Submission Review step.
6. GenLayer evaluation in progress (`/milestones/[id]/evaluation`) — the consensus-stage timeline
   mid-flight.
7. Final consensus result — the finalized per-requirement breakdown, score, and decision.
8. Settlement — the Release Payment / Refund Client confirmation and updated balance.
9. Transaction/activity history (`/profile`'s "Recent activity").
10. Explorer proof — the network explorer page for a real transaction hash from this app.

Every one of these requires a real deployment and real wallet activity to capture honestly — none
of them should be recreated with mocked data or a design tool. See `docs/limitations.md` for why
none exist yet from this development environment.

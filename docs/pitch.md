# Pitch

Central message: **WorkResolve turns ambiguous freelance deliverables into verifiable,
decentralized escrow decisions using GenLayer.**

## 30-second pitch

"Freelance milestone disputes usually get settled by one side's word, a platform's support agent,
or nothing at all. WorkResolve puts payment into on-chain escrow and has GenLayer's decentralized
validator network read the actual submitted evidence — a live site, a repository — against
requirements agreed on before the work started, and settles automatically based on that consensus.
No centralized arbiter decides; a network does, and the decision is never final until independent
validators agree."

## 1-minute pitch

"Freelance work disputes over 'is this milestone actually done' get resolved one of three ways
today: a centralized platform's support team makes the call, the two parties argue it out directly,
or nobody resolves it and someone just loses out. None of that is decentralized, and none of it is
evidence-based.

WorkResolve replaces that with an escrow contract built on GenLayer's Intelligent Contracts. A
client and freelancer agree on structured, weighted requirements up front — those become immutable
the moment the client funds escrow. The freelancer submits real evidence: a deployed URL, a
repository, notes. Then GenLayer's validators fetch that evidence and independently evaluate it
against the original requirements, reaching consensus on a structured, per-requirement result
before it's ever finalized on-chain. A plain deterministic contract reads that result — never the
evaluator's own stated opinion — computes a score, and automatically releases payment or refunds
the client.

It's not an 'AI approves everything' system — we deliberately demo a REJECT case too, where
incomplete work is caught and refunded. And it's not a black box: every requirement, every
evaluation stage, and every settlement is a real, inspectable on-chain transaction."

## 3-minute pitch

"Let's start with the actual problem. A freelancer finishes a milestone. The client isn't sure it
meets what they agreed on. Today, that disagreement gets resolved by a centralized platform
deciding for both of them, by the two people arguing directly until one side gives up, or by
nobody resolving it at all and someone eating the loss. All three of those are broken in the same
way: there's no decentralized, evidence-based process for deciding whether delivered work actually
meets agreed criteria.

WorkResolve is built to be that process. It's escrow — a client locks payment on-chain before work
starts, so a freelancer isn't working on trust alone. But it's escrow with a real decision
mechanism behind the release, instead of a single 'approve' button one party controls.

Here's the flow. A client creates a milestone with a title, a payment amount, a deadline, and a set
of weighted requirements — concrete things like 'responsive layout' or 'working contact form,' each
with a weight that adds up to 100. Funding the milestone locks those requirements — they become
immutable, committed on-chain by hash, so neither side can quietly move the goalposts partway
through. The freelancer accepts, does the work, and submits evidence: a deployed URL, a repository
link, up to ten more evidence links.

This is where GenLayer does the thing a normal smart contract structurally can't. A conventional
deterministic contract has no way to look at a live website and judge whether it's 'responsive' —
every validator has to compute the exact same result from the exact same input, and 'read this page
and judge it' isn't a deterministic function. GenLayer's Intelligent Contracts solve that: the
contract fetches the submitted evidence, runs it through an LLM-backed evaluation under a prompt
structure that treats every fetched page as untrusted content to assess — not an instruction to
follow, which matters, because otherwise a submission could just tell the evaluator to approve it —
and independent GenLayer validators have to agree on the identical structured result before it
counts.

Once that consensus is reached, WorkResolve deliberately hands control back to plain, deterministic
code. A weighted score comes purely from the validated per-requirement statuses — the evaluator's
own opinion about what the final decision should be is never even read. If the score clears the
threshold, escrow releases to the freelancer. If not, it refunds the client. No AI involvement in
that step at all — just a boring, auditable, idempotency-protected transfer.

We're not claiming this is infallible. AI evaluation is probabilistic, not a legal judgment, and
we say that plainly in our own documentation. We're not claiming it's trustless in some absolute
sense — you're trusting GenLayer's validator network to reach honest consensus, the same way any
blockchain asks you to trust its own consensus mechanism. What we are claiming, and what we can
actually demonstrate, is this: remove GenLayer from WorkResolve, and you lose the one thing that
makes it more than a plain multisig — the ability to decide, without a centralized arbiter, whether
the work was actually done. That's the whole bet, and it's the only part of this product that
needed to be built on GenLayer instead of anywhere else."

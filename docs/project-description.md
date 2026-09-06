# Project Description

## Short description (~50 words)

WorkResolve is decentralized escrow for freelance milestones. A client locks payment on-chain; a
freelancer submits evidence of completed work; GenLayer's Intelligent Contracts fetch and evaluate
that evidence against the original requirements, and independent validators must reach consensus
before escrow automatically releases or refunds.

## Medium description (~150 words)

Freelance milestone disputes are usually settled by one side's word, a centralized platform's
support agent, or nothing at all. WorkResolve replaces that with an on-chain escrow whose release
decision comes from GenLayer's decentralized validator consensus instead of a single "approve"
button. A client and freelancer agree on structured, weighted requirements up front; the client
locks payment into escrow; the freelancer submits evidence — a deployed URL, a repository, notes.
GenLayer's Intelligent Contract fetches that evidence and evaluates it against the original,
immutable requirements, classifying each one PASS, FAIL, PARTIAL, or UNVERIFIABLE. Multiple
independent validators must agree on the same structured result before it's finalized on-chain.
A plain, deterministic contract then reads that finalized result and releases or refunds escrow —
the AI evaluation itself never touches funds directly. The result is neither a "trust the platform"
system nor a "trust nothing gets resolved" system: a decentralized, evidence-based judgment with
money that moves automatically once consensus is reached.

## Long description (~500 words)

Freelance work disputes over "is this milestone actually done" are one of the most common failure
points in remote freelance work. Today they're resolved one of three ways: a centralized platform's
support team makes a judgment call (opaque, slow, and itself a single point of trust); the two
parties negotiate directly (which breaks down exactly when they disagree); or nothing gets resolved
and one side simply loses out. None of these involve an actual, evidence-based, decentralized
process for deciding whether delivered work meets agreed criteria.

WorkResolve is an attempt to build that process directly into an escrow contract, using GenLayer's
Intelligent Contracts to do the one thing a conventional deterministic smart contract structurally
cannot: read and judge unstructured real-world evidence — a live website, a source repository, free
text — against a fixed set of requirements, with a decentralized validator network required to
agree on the result before it counts.

The flow is Create → Fund → Accept → Submit → Evaluate → Consensus → Settle. A client defines a
milestone with a title, a payment amount, a deadline, and a set of weighted requirements (e.g.
"responsive layout," weight 20; "working contact form," weight 30). Once funded, those requirements
become immutable — committed on-chain via a hash, so neither party can quietly change the goalposts
mid-contract. The assigned freelancer accepts and, when the work is ready, submits evidence: a
deployed URL, a repository link, and up to ten additional evidence links. Anyone — client,
freelancer, or an outside party — can then trigger evaluation, since the method is deliberately
permissionless.

That's where GenLayer does its distinctive work. The contract's `evaluate_and_finalize` method
fetches the submitted evidence and runs it through an LLM-backed evaluation, under an explicit
prompt hierarchy that treats every fetched page and every submitted URL as untrusted content to be
*assessed*, never as an instruction to *obey* — a direct defense against a submission trying to
talk its way into an automatic approval. Independent GenLayer validators run that same
non-deterministic evaluation and must reach consensus on an identical structured result (a
PASS/FAIL/PARTIAL/UNVERIFIABLE status per requirement, with a short explanation) before it's
accepted on-chain.

Once that result is finalized, WorkResolve deliberately hands control back to ordinary,
deterministic contract logic. A weighted score is computed purely from the validated statuses — the
evaluator's own stated opinion about what the "score" or "decision" should be is never read at
all — and compared against the milestone's approval threshold. If it clears the bar, escrow releases
to the freelancer; if not, it refunds the client. Settlement is a plain, idempotency-latched value
transfer with no AI involvement whatsoever.

The result is a system where the judgment call that genuinely needs interpretation is handled by a
decentralized network reaching consensus on real evidence, and everything downstream of that
judgment — the money, the state machine, the escrow accounting — is boring, auditable,
deterministic code. That split is the whole point: remove GenLayer, and WorkResolve loses the one
capability that makes it more than a plain multisig escrow — the ability to decide, without a
centralized arbiter, whether the work was actually done.

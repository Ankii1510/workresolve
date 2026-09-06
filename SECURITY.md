# Security

WorkResolve is pre-1.0, testnet-only software. This document states its security assumptions,
known limitations, and how to report a vulnerability. For the full technical audit (contract,
frontend, GenLayer evaluation, with severity ratings), see [`docs/security.md`](docs/security.md).

## Audit status

**This contract has not been formally audited by a third-party security firm.** Every claim of
"tested" or "verified" in this repository refers to this project's own test suite (90/90 contract
logic tests, 152/152 frontend unit tests — see `docs/security.md` and `docs/release-checklist.md`)
and manual code review, not an independent professional audit. Do not treat this software as
audited in the industry sense of that word.

## Testnet status

Nothing in this codebase has been deployed to, or run against, a live GenLayer network as of this
writing (no reachable Docker daemon and no network egress to any `genlayer.com` host exist in the
development environment this project was built in — see `docs/limitations.md`). **Never send real
funds to this contract on any network until a real deployment, with a verified address, has been
publicly confirmed.**

## Security assumptions

- The GenLayer validator network reaches honest consensus. WorkResolve's evaluation step is only as
  trustworthy as GenLayer's own consensus mechanism — this project doesn't add an independent trust
  layer on top of it, and doesn't claim to.
- The connected wallet and its extension are not compromised. WorkResolve never requests, stores,
  or transmits a private key or seed phrase; it only ever asks the injected wallet to sign
  transactions the user can inspect before approving.
- The RPC endpoint returned by the selected GenLayer network configuration is not maliciously
  substituted. `NEXT_PUBLIC_GENLAYER_RPC_URL` is an optional override; using an untrusted custom RPC
  endpoint is the operator's own choice and risk.

## External evidence risks

Submitted evidence (a deployed URL, a repository link, additional evidence links, free-text notes)
is treated as **untrusted content supplied by an interested party** everywhere in this codebase —
never as instructions, and never as fact:

- The contract's evaluation prompt uses an explicit three-tier hierarchy (system rules → immutable
  requirements → untrusted evidence) specifically to resist a submission trying to talk the
  evaluator into an automatic approval. See `docs/evaluation.md` "Prompt Injection Defense."
- The frontend never fetches, previews, or embeds submitted URLs — it only ever renders them as
  plain, safely-attributed links (`rel="noreferrer noopener"`), and only after validating the URL
  scheme is `http`/`https` (added in Phase 8 specifically because a `javascript:`/`data:` URL,
  otherwise unvalidated, would have been renderable as a clickable link).
- Submitted evidence can disappear, change, or become inaccessible after submission — the evaluator
  reads whatever it can fetch at evaluation time and reports `UNVERIFIABLE` when it can't, rather
  than fabricating a status. There is no snapshot/archival mechanism.

## AI evaluation limitations

GenLayer's evaluation is a probabilistic judgment, not a deterministic computation or a legal
determination. It can be wrong. It should not be relied on for disputes involving amounts a party
cannot afford to lose to an incorrect judgment, and it makes no claim to legal validity or binding
arbitration of any kind.

## Known limitations

See `docs/limitations.md` for the full, current, honest list. The two most relevant to security:
nothing in this codebase has been executed against live GenVM consensus, and
`gl.ContractAt(...).emit_transfer(...)` — the mechanism that actually moves funds out of the
contract — has never been exercised against a live network.

## Reporting a vulnerability

If you find a security issue in this codebase, please report it privately rather than opening a
public issue, so a fix can be prepared before the details are public:

1. Open a private security advisory on this repository (GitHub's "Report a vulnerability" under the
   Security tab), if the hosting repository supports it; or
2. Contact the maintainer(s) directly through the contact method listed in the repository's profile
   or README.

Please include: the affected file/function, a concrete reproduction (a test case is ideal), and the
worst-case impact you believe it enables. This is a testnet-stage, unaudited project — please give
a reasonable window to respond before any public disclosure.

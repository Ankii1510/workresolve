# Final Release Checklist

Phase 9. Checked boxes reflect something actually verified in this repository; an unchecked box
states exactly why, same convention as `docs/release-checklist.md` (Phase 8), which this
supersedes for release purposes.

## Code

- [x] Clean repository — repository re-audited this phase: no `console.log`/debug logging, no
      TODO/FIXME markers, no dead component files (`src/components/ui/Dialog.tsx` — zero call
      sites, zero tests — removed this phase).
- [x] No secrets — re-audited: no private keys, seed phrases, API keys, or credentials anywhere in
      source; `.env.example` contains only safe placeholders; git history is a single
      `create-next-app` scaffold commit with nothing to leak (see "Git History" below).
- [x] No fake data — every blockchain-facing value in the app is either a real contract read/write
      result or explicitly, visibly labeled EXAMPLE/DEMO static content (`/demo` page), never mixed
      with live wallet data.
- [x] No debug code — confirmed by grep this phase (see above).

## Contract

- [ ] Deployed — **not done**. No reachable Docker daemon, no `genlayer.com` network egress from
      this environment (re-confirmed with a live check this phase).
- [ ] Verified (source-to-bytecode) if supported — not applicable until deployed.
- [x] Tested — 90/90 pure-Python logic tests passing (`contracts/tests_logic`).
- [ ] Address documented — not available; no deployment exists.

## GenLayer

- [x] Intelligent Contract documented — `docs/genlayer-integration.md` (new this phase),
      `docs/evaluation.md`, `docs/contracts.md`.
- [x] Evaluation tested — at the deterministic-logic level (payload validation, scoring, decision);
      not against a live evaluator round (environment blocker, unchanged).
- [ ] Consensus tested — no live consensus round has ever been observed from this environment.
- [x] Prompt injection tested — `TestPromptInjectionDefense` (5 tests) plus the Phase 8 red-team
      additions (out-of-range score, empty/enormous response, bool-typed id). Not verified against
      a live LLM + adversarial page.

## Frontend

- [ ] Production deployed — **not done**. No public hosting deployment has been made from this
      environment (see "Remaining blockers" in the final report).
- [x] Wallet tested — `useWallet.test.tsx` plus repeated code-review passes (Phases 7 & 8) of
      disconnect/lock/account-switch/network-switch handling. Not tested with live manual wallet
      interaction in a real browser.
- [ ] Mobile tested — reviewed at the code/layout level only; no real-device testing performed.
- [x] Error states tested — global error boundaries, `ErrorNotice` retry paths, and blockchain
      error classification all reviewed and unit-tested.

## Demo

- [ ] APPROVE scenario — **not run**; requires a live deployment (blocked, see above).
- [ ] REJECT scenario — **not run**, same blocker.
- [ ] Explorer proof — no real transaction exists yet to link to.
- [x] Video script — `docs/demo-video-script.md` (new this phase), written and ready to record the
      moment a real deployment exists.

## Documentation

- [x] README — fully rewritten this phase as a professional open-source README.
- [x] Architecture — `docs/architecture.md` (Phase 2+), cross-checked against the actual
      implementation this phase (see the Phase 9 completion report's "Final Architecture
      Verification").
- [x] Security — `docs/security.md` (audit) and `SECURITY.md` (root-level disclosure policy, new
      this phase).
- [x] Limitations — `docs/limitations.md` (Phase 8), still accurate as of this phase.
- [x] Demo guide — `docs/demo.md` (Phase 8, reviewed this phase).
- [x] Submission package — `docs/submission.md` (new this phase; see its own completeness note).

## What would need to change for every box above to be checkable

Exactly the same environment constraint named in every prior phase's report: a machine or service
with a working Docker daemon (for a local GenLayer Studio simulator) or genuine network egress to a
public GenLayer testnet RPC, plus a place to host the frontend publicly. Nothing else listed above
traces back to a code defect.

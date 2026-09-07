# Release Checklist

Status as of Phase 8. Checked boxes reflect something actually verified in this repository, not an
aspiration — an unchecked box states exactly why.

## Smart Contract

- [x] Tested — 90/90 pure-Python logic tests passing (`contracts/tests_logic`), including
      authorization, double-payout/double-refund, requirement immutability, prompt-injection
      defense, malformed-evaluation rejection (including Phase 8 additions: bool-typed ids,
      out-of-range score fields, empty/enormous responses), and URL-scheme validation.
- [x] Security reviewed — full audit in `docs/security.md`, all CRITICAL/HIGH findings fixed this
      phase (evidence URL scheme validation added to `submit_work`, bool-id validation hardened).
- [ ] Deployment recorded — **not done**. No Docker daemon and no `genlayer.com` network egress
      exist in this environment (re-confirmed this phase). No contract has ever been deployed from
      here; there is no address, network, or deployment transaction to record.
- [x] State transitions verified — see the transition table in `docs/contracts.md` "State Machine"
      and `TestStateMachine`/`TestDoubleSettlementAtStateMachineLevel` in `tests_logic`.

## GenLayer

- [x] Current SDK verified — `genlayer-js@1.1.8` is npm's `latest` dist-tag (checked live this
      phase); a `2.0.0-rc.1` release candidate exists but is tagged `rc`, not `latest`, so it was
      deliberately not adopted. No deprecation warnings found for the APIs this app uses.
- [ ] Evaluation tested — tested at the code/logic level (payload validation, scoring, decision);
      **not tested against a live evaluator/validator round** (same environment blocker as above).
- [ ] Consensus tested — same as above: no live consensus round has ever been observed from this
      environment.
- [x] Prompt injection tested — `TestPromptInjectionDefense` (5 tests) plus this phase's Section 7
      red-team review; verified at the code/data-flow boundary (the evaluator's own stated
      decision/score is structurally never read). Not verified against a live LLM + adversarial
      page.

## Frontend

- [x] Wallet tested — `useWallet.test.tsx` (disconnected/connected/wrong-network/account-change/
      rejection) plus this phase's code-review pass over disconnect/lock/network-switch handling.
      Not tested with live manual wallet interaction in a real browser.
- [x] Transactions tested — `useTransaction`'s state machine, banner states, and every write
      control's disabled-while-pending behavior reviewed; no auto-resubmission path exists anywhere.
- [ ] Mobile tested — reviewed at the code/layout level (Tailwind responsive classes present
      throughout); **no real-device or browser-viewport testing was performed** in this
      environment.
- [x] Error states tested — global error boundaries (`error.tsx`, `global-error.tsx`), `ErrorNotice`
      retry paths, and blockchain-error classification (`classifyBlockchainError`) all reviewed and
      unit-tested (`errors.test.ts`).

## Security

- [x] Secrets checked — `.env.example` reviewed line by line; no private keys, seed phrases, API
      secrets, or production credentials present; every `NEXT_PUBLIC_*` variable is safe to expose
      by design.
- [x] External content checked — no `dangerouslySetInnerHTML`, no `<iframe>` anywhere in `src/`;
      every submitted evidence URL is now scheme-validated (http/https only) at both the contract
      (`submit_work`) and the one rendering component (`EvidenceList.tsx`) before it can become a
      clickable link — this phase's fix for the CRITICAL finding in `docs/security.md`.
- [x] XSS checked — same as above; React's default escaping is the baseline, backed by the
      structural absence of any raw-HTML injection point.
- [x] URL validation checked — `javascript:`/`data:`/`file:`/`vbscript:` schemes are rejected both
      in the contract and in the frontend's rendering layer (Phase 8 fix); 12 new tests cover this
      directly.
- [x] Authorization checked — every restricted contract method checks `sender_address`; frontend UX
      gates mirror but never replace these checks (`docs/security.md` F4/F6).

## Testnet

- [ ] APPROVE flow — **not run**. Requires a reachable GenLayer network; blocked in this
      environment (see above).
- [ ] REJECT flow — **not run**, same blocker.
- [ ] Settlement verified — **not run**, same blocker.
- [ ] Explorer links verified — `src/lib/genlayer/explorer.ts` derives real explorer URLs from
      genlayer-js's own chain metadata (never fabricated), but the exact per-transaction deep-link
      path has never been confirmed against a live explorer instance (documented in
      `TransactionStatusBanner.tsx`'s `ExplorerLink` docstring).

## Build

- [x] Lint — clean, zero warnings suppressed (`npm run lint`).
- [x] Typecheck — clean (`npm run typecheck`).
- [x] Tests — 152/152 frontend unit tests, 94/94 contract logic tests.
- [x] Production build — `npm run build` succeeds; additionally verified by actually running
      `npm start` and curling every route in production mode this phase (not just a dev-mode
      check), confirming the new security headers apply and no page 500s.

## What would need to change for every box above to be checkable

A GenLayer-network-reachable environment (a machine with a working Docker daemon for a local
GenLayer Studio simulator, or genuine network egress to a public testnet RPC). Nothing else listed
above is blocked by a code defect — every unchecked box traces back to that one environment
constraint. See `docs/limitations.md`.

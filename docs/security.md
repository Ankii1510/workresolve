# Security

**Updated in Phase 8** (Final Testnet Validation + Release Candidate audit): five new findings from
a fresh, adversarial pass are added below (C10, C11/L3, F11, F12), all fixed in this phase. Nothing
from the Phase 7 table below was found to be wrong on review; it's carried forward unchanged except
where a Phase 8 fix directly extends it.

This document consolidates WorkResolve's security posture into one place, per the Phase 7 audit.
It does not repeat every line of the deeper reviews already written in `docs/contracts.md`
("Security Threat Model") and `docs/evaluation.md` ("Security review") — it summarizes each
finding with a severity, points at the code/tests that address it, and states what residual risk
remains. Nothing here is aspirational: every "Fixed" item below has a corresponding code change or
test in this repository, and every "Residual risk" is a real, currently-true gap, not a hedge.

Severity scale used throughout: **Critical** (funds or evaluation integrity directly at risk),
**High** (a realistic path to incorrect behavior or user harm), **Medium** (a real weakness with a
narrow trigger or limited blast radius), **Low** (defense-in-depth / hardening).

## 1. Smart contract

| # | Finding | Severity | Status | Fix / evidence | Residual risk |
|---|---|---|---|---|---|
| C1 | Unauthorized state mutation (e.g. a non-client funding/cancelling, a non-freelancer accepting/submitting) | Critical | Fixed | Every restricted method checks `gl.message.sender_address` against the stored `client`/`freelancer` before mutating state (`contracts/workresolve.py`); covered by `contracts/tests_logic/test_workresolve_logic.py::TestAuthorization` (part of the 70 passing tests). | None identified at the logic level. Not yet exercised against a live GenVM sender identity (see Known Limitations in `docs/contracts.md`). |
| C2 | Double payout / double refund | Critical | Fixed | `paid`/`refunded` boolean latches are checked and set before any transfer; `docs/contracts.md` "Double Settlement Protection" documents the exact guard and its test. | None identified. |
| C3 | Requirements mutated after funding (moving the goalposts on a freelancer mid-contract) | Critical | Fixed | `milestone.requirements` is written once at `create_milestone` and never reassigned by any other method; a `requirements_hash` commitment lets this be independently checked. See `docs/contracts.md` "Requirement Immutability". | Frontend-side independent hash verification is unconfirmed against a live `gl.hash` (see Known Limitation #5 in `docs/contracts.md`) — this weakens auditability, not the on-chain guarantee itself. |
| C4 | Evaluator's own stated score/decision is trusted directly (prompt injection winning outright) | Critical | Fixed | `evaluate_and_finalize` never reads a `"score"` or `"decision"` field from the LLM's JSON — score and decision are computed by deterministic Python (`compute_score`/`decide`) from validated per-requirement statuses only. Five dedicated tests in `TestPromptInjectionDefense` assert an injected decision/score/extra-requirement is structurally ignored. See `docs/evaluation.md` "Prompt Injection Defense". | The defense is verified at the code/data-flow level (pure-Python mirror), not against a live GenVM consensus round with a real adversarial webpage — see item L1 below. |
| C5 | Reentrancy during a payout/refund transfer | High | Fixed | Checks-effects-interactions: state and the `paid`/`refunded` latch are written before the single `emit_transfer` call in each of `release_payment`/`refund_client`/`cancel_milestone`. | Not exercised against a live reentrant contract on GenVM (no live network available — see below). |
| C6 | Malformed / partial evaluator JSON breaking finalization or being silently accepted | High | Fixed | `_validate_evaluation_payload` rejects any payload missing a status for a known requirement, containing an unknown requirement id, or using a status outside the fixed enum; see `docs/contracts.md` "Malformed Evaluation Handling". | None identified beyond live-network confirmation. |
| C7 | Deadline manipulation extending/shrinking an active contract | Medium | Fixed | `deadline` is set once at creation and never mutated; only `cancel_milestone` reads it, against a contract-internal, caller-uninfluenced timestamp. | The exact cross-validator reconciliation of `_now_unix()` is inferred from a bundled GenLayer example, not confirmed live (Known Limitation #3 in `docs/contracts.md`). |
| C8 | DoS via an oversized milestone (huge requirement text / evidence list inflating evaluation cost) | Medium | Fixed | `MAX_EVIDENCE_ITEMS`, `MAX_REQUIREMENT_DESCRIPTION_LEN`, `MAX_DESCRIPTION_LEN`, `MAX_TITLE_LEN`, and `MAX_FETCHED_CONTENT_CHARS` bound every size a milestone can push through evaluation. | None identified. |
| C9 | Repeated/expensive `evaluate_and_finalize` calls once already evaluating or finalized | Medium | Fixed | The method's own state guard only allows the call from `SUBMITTED`; the frontend additionally disables the trigger control while a local evaluation transaction is pending (see F5 below) and never polls the chain to auto-retrigger it. | A second wallet could still call `evaluate_and_finalize` a second time from a different browser between the first call landing and the state update being visible to them — this fails the contract's state guard (not a security hole) but is a UX case worth a clearer error message; noted, not yet special-cased in copy. |
| C10 | **(Phase 8)** Evidence URLs (`deployed_url`/`repository_url`/`evidence_urls`) accepted by `submit_work` with no scheme validation — a `javascript:`/`data:`/`file:` value would be stored on-chain and later rendered as a clickable link by the frontend | Critical | Fixed this phase | `_is_safe_evidence_url()` (mirrored in both `workresolve.py` and `contracts/logic/workresolve_logic.py` as `is_safe_evidence_url`/`validate_submission_urls`) now rejects any non-http(s) scheme or oversized value at submission time — the contract is the one place every possible caller, not just this app's own form, must pass through. `EvidenceList.tsx` independently re-checks the scheme before rendering an `href` (defense in depth — see F1/F2). 15 new tests (`TestSubmissionUrlValidation` in `tests_logic`, plus the frontend's existing `submitForm.test.ts` coverage). | The contract-side fix has not been exercised against a live GenVM (same live-network caveat as everything else in this table). |
| C11 | **(Phase 8)** `bool` accepted as a valid requirement `id` in the evaluation payload (Python's `bool` is an `int` subclass, so `isinstance(rid, int)` alone lets `True`/`False` coincide with integer ids `1`/`0`) | Low | Fixed this phase | Both `workresolve.py` and `workresolve_logic.py` now explicitly exclude `bool` (`not isinstance(rid, int) or isinstance(rid, bool)`). New test: `test_rejects_bool_id_despite_bool_being_an_int_subclass`. | None identified — this was a narrow gap (LLM evaluator output is unlikely to emit a JSON boolean as an id) closed defensively. |

**Live-network status.** As in Phases 4-6, this contract has never been deployed or executed
against a real or local GenVM (no reachable Docker daemon, no network egress to any
`genlayer.com` host from this sandbox — re-confirmed at the start of this phase, see
`docs/contracts.md` "Known Limitations" and the Phase 7 report's "End-to-end test" section). Every
finding above marked "Fixed" is fixed and tested at the deterministic-logic level
(`contracts/logic/workresolve_logic.py`, 70/70 pytest passing); none of it has been confirmed
against a live consensus round. That gap is stated plainly, not glossed over.

## 2. Frontend

| # | Finding | Severity | Status | Fix / evidence | Residual risk |
|---|---|---|---|---|---|
| F1 | XSS via rendering user/evidence-supplied content as HTML | Critical | Fixed | No `dangerouslySetInnerHTML` anywhere in `src/` (verified by repo-wide grep); every user- or evidence-supplied string (titles, descriptions, evidence URLs, evaluator explanations) is rendered as React text content, never parsed as markup. | None identified. |
| F2 | Arbitrary external content executed with the app's origin privileges (e.g. an `<iframe>` embedding a submitted site) | Critical | Fixed | No `<iframe>` anywhere in `src/`. `EvidenceList` (`src/components/evidence/EvidenceList.tsx`) renders every submitted URL as a plain, safely-attributed `<a>` — never fetched, previewed, or embedded by this app. | None identified. |
| F3 | `target="_blank"` reverse-tabnabbing (an opened evidence page using `window.opener` to redirect the WorkResolve tab) | High | Fixed | Every external link in the codebase uses `rel="noreferrer noopener"` (verified by grep across `src/`; one link — the wallet-install link — was found using only `rel="noreferrer"` during this audit and was corrected to `noreferrer noopener` for consistency). | None identified. |
| F4 | Frontend claiming an action succeeded, or is valid, when the contract would reject it | Critical | Fixed | `useTransaction` never shows `SUCCESS` before GenLayer's own `FINALIZED` receipt status; every write button's enabled/disabled state is derived from the same on-chain milestone state the contract itself checks (`canAcceptMilestone`/`canTriggerEvaluation`/`canReleasePayment`/`canRefundClient` in `src/lib/genlayer/milestone.ts`) — these are advisory UX gates, not the source of truth, and a rejected transaction still surfaces the contract's real error. | If the frontend's derived-state logic and the contract's actual guard ever drift (e.g. a future contract change not mirrored here), the UI could offer an action the contract then rejects — this fails safely (clear error, no funds moved) but is a maintenance risk, not a security one. |
| F5 | Double-submission of a write transaction (double-click, or triggering evaluation twice) | Medium | Fixed | Every write control is disabled while its `useTransaction` status is `WAITING_FOR_SIGNATURE`/`SUBMITTING`/`CONFIRMING` (10 call sites across `src/app/milestones/**` use `disabled={...}` keyed off transaction status); no polling loop exists that could re-trigger a write automatically. | None identified. |
| F6 | User-controlled input reaching the contract without validation (malformed address, negative amount, out-of-range weights) | High | Fixed | `src/lib/genlayer/milestoneForm.ts` / `submitForm.ts` validate every field client-side (address format, amount > 0, weight sum = 100, URL shape, string length caps) — but per section 24 of the spec, this is explicitly documented as a UX convenience, not a security boundary; the contract independently re-validates every one of these (amount, weights, lengths) and is the actual authority. | None — this is the intended defense-in-depth split, not a gap. |
| F7 | Automatic retry silently resubmitting a transaction (double-spend risk from a naive "retry on failure") | High | Fixed | `useTransaction` never auto-resubmits a failed or pending write; a failed transaction requires the user to explicitly start over from the review step. Reads (`useContractRead`) do offer a manual "Try again" retry (`ErrorNotice`'s `onRetry`), which is safe to automate/retry freely since reads have no side effects — this satisfies section 20 without introducing any transaction-retry risk. | None identified. |
| F8 | Wallet/network edge cases (locked wallet, account switch mid-session, network switch, extension missing, user rejection) mishandled, leading to stale or misleading state | High | Fixed | `useWallet` (`src/hooks/useWallet.tsx`) listens for `accountsChanged`, `chainChanged`, and EIP-1193 `disconnect`; derives an explicit 5-state `DISCONNECTED \| CONNECTING \| CONNECTED \| WRONG_NETWORK \| ERROR` status; treats zero authorized accounts as disconnected; and surfaces `hasWallet: false` distinctly from "disconnected" when no injected provider exists at all. | Re-verified by code review this phase, not by live manual wallet interaction (no browser automation was used in this session — see the Phase 7 report's "Known limitations"). |
| F9 | Uncaught render/runtime error taking down the whole app with a raw stack trace | Medium | Fixed | `src/app/error.tsx` (route-level) and `src/app/global-error.tsx` (root-level, for failures in the root layout itself) both render a plain "Something went wrong" recovery UI with "Try Again"/"Go to Dashboard" actions; no stack trace or internal error detail is shown to the user, and the underlying error is only logged to the console outside production. | None identified. |
| F10 | Fabricated/optimistic blockchain data (fake transaction hashes, invented validator counts, synthesized event history) | Critical | Fixed | Documented and enforced project-wide as "No Fake Data" / "No Fake Evaluation" (see `docs/frontend.md` and `docs/evaluation.md`); the Phase 7 activity log (`src/lib/activity.ts`) only ever records a transaction hash after a real `waitForTransactionReceipt` success, and is explicitly documented as a local, per-browser record — not represented as a complete historical ledger. | None identified. |
| F11 | **(Phase 8)** No CSP or HTTP security headers configured at all (`next.config.ts` was an empty config) | High | Fixed this phase | Added a static `Content-Security-Policy` plus `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and a restrictive `Permissions-Policy` via `next.config.ts`'s `headers()`. Verified by actually running the production build (`npm run build && npm start`) and curling every route — headers apply, all routes still return 200. `script-src` had to include `'unsafe-inline'` after this same production run showed Next's App Router injects un-nonced inline RSC-bootstrap scripts on every page; documented in-code why, and why this doesn't weaken the app's actual XSS defense (there's no injection point for it to protect against — see F1/F2). | A nonce-based strict CSP (no `'unsafe-inline'` at all) would require a Proxy/middleware layer forcing every route into dynamic rendering — a real architecture change, deliberately not made in a release-candidate phase explicitly scoped to avoid unnecessary redesign. |
| F12 | **(Phase 8)** `Dialog` component has no Tab focus trap and doesn't restore focus on close | Medium | Fixed in Phase 8, component removed in Phase 9 | Phase 8 added a Tab/Shift+Tab focus trap and focus restoration. Phase 9's release cleanup removed `src/components/ui/Dialog.tsx` entirely: it had zero call sites and no tests anywhere in the app, so it was genuinely dead code, not a documented, exercised primitive — kept as a fixed-but-unused component would only have shipped an untested surface into the release. If a future phase needs a modal, reintroduce it (with tests and a real call site) using the Phase 8 focus-trap pattern as a reference, preserved in this row. | None — the finding is moot now that the code it applied to no longer exists. |

## 3. GenLayer evaluation (untrusted-content handling)

Every piece of evidence a freelancer submits — a deployed URL, a repository URL, extra evidence
links, free-text evaluator notes — is treated as **untrusted data supplied by an interested party**,
never as instructions, and never as trusted fact. This is enforced in two independent places:

- **Contract side.** `evaluate_and_finalize` builds its evaluation prompt with an explicit,
  documented three-tier hierarchy: (1) fixed system rules, (2) the immutable, on-chain
  `milestone.requirements`, (3) the fetched/submitted evidence, clearly labeled as untrusted input
  to be *assessed*, not obeyed. See `docs/evaluation.md` "Prompt Injection Defense" for the full
  prompt structure and `contracts/tests_logic/test_workresolve_logic.py::TestPromptInjectionDefense`
  for the five tests exercising this boundary at the code level (injected decision ignored,
  injected score ignored, injected extra "requirement" rejected, status enum can't be widened by
  injected text, `decide()`/`compute_score()` take no free text at all — they only ever see the
  validated status enum).
- **Frontend side.** Evidence URLs are never fetched, rendered as HTML, or previewed by the
  frontend itself (see F1/F2 above) — the only frontend-side use of evidence is as plain link text
  a human clicks through to look at themselves.

| # | Scenario | Severity | Status | Notes |
|---|---|---|---|---|
| G1 | Malicious webpage content instructing the evaluator to approve/score 100 regardless of actual work | Critical | Mitigated, verified at code level | Structurally can't reach the decision — see prompt-injection tests above. Not verified against a live LLM + live adversarial page (requires a live GenVM run — see Known Limitations). |
| G2 | Malicious README/docs embedding fake "system" or "developer" instructions | Critical | Mitigated, verified at code level | Same defense — the evidence tier of the prompt is never elevated to instruction-level regardless of its own claimed formatting. |
| G3 | Evidence page unavailable, erroring, or returning non-HTML content | Medium | Fixed | `_validate_evaluation_payload`'s fixed status enum includes `UNVERIFIABLE`, explicitly for exactly this case — see `docs/contracts.md` "Handling UNVERIFIABLE". No status is fabricated when content can't be assessed. |
| G4 | Evaluator returns malformed/partial/extra-field JSON | High | Fixed | See C6 above — rejected by `_validate_evaluation_payload`, not silently coerced. |
| G5 | Evaluator's raw chain-of-thought or overly verbose reasoning leaking into the UI | Low | Fixed | The schema only carries a concise per-requirement `explanation` string (length-capped); nothing in the prompt asks for or the schema accepts a reasoning trace. |

## 4. Configuration / production readiness

| # | Item | Status | Evidence |
|---|---|---|---|
| P1 | No private key, seed phrase, or API secret ever placed in a `NEXT_PUBLIC_*` variable | Confirmed | `.env.example` reviewed line by line this phase; the only server-side (non-`NEXT_PUBLIC_`) variables are the still-unimplemented `IPFS_PINNING_API_KEY`/`_SECRET`, documented as future and currently commented out. |
| P2 | `.env.example` contains no real values, only placeholders and documentation | Confirmed | Reviewed this phase — every value is either commented out or a safe default (`NEXT_PUBLIC_GENLAYER_NETWORK=studionet`). |
| P3 | Dev/testnet config can't accidentally resolve to a production contract | Confirmed | `NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS` is unset by default; `src/lib/genlayer/config.ts` fails closed with a clear "not configured" error rather than falling back to any hardcoded address (there is no hardcoded address anywhere in the codebase — verified by grep for `0x` literals in `config.ts`). |
| P4 | No secret or credential committed to the repository | Confirmed | No `.env.local` or equivalent file exists in the working tree; `.gitignore` excludes it (see README "Environment variables"). |

## 5. Summary of residual risk (honest, not hedged)

The two risks that matter most, unchanged in kind since Phase 4-6 and re-confirmed this phase:

1. **Nothing in this codebase has been executed against a live GenVM.** Every "Fixed" contract
   finding above is fixed and tested at the deterministic pure-Python logic level (70/70 tests),
   not confirmed against real validator consensus, a real LLM evaluating a real adversarial
   webpage, or a real `emit_transfer` moving real funds. This is a sandbox limitation (no Docker
   daemon, no `genlayer.com` network egress — re-checked at the start of this phase with the same
   result as Phases 4-6), not a design gap.
2. **Wallet and browser edge cases were re-verified by code review, not by live manual testing.**
   No browser automation tooling was used in this phase; the `useWallet` event-handling logic was
   read and reasoned about, not exercised by actually locking a wallet, switching accounts, or
   changing networks mid-session in a real browser.

A third, new-in-Phase-8 item, narrower than the two above: the production CSP's `script-src`
includes `'unsafe-inline'` because Next.js's App Router injects its own un-nonced inline bootstrap
scripts on every route — a nonce-based CSP would require adopting Proxy/middleware-based dynamic
rendering everywhere, an architecture change out of scope for this release-candidate phase. This
was caught and documented, not silently accepted — the app's real XSS defense was never "the CSP
will save us," since there's no injection point for inline-script CSP to protect against in the
first place (see F1/F2).

No finding above was downgraded or omitted to make this phase look more complete than it is.

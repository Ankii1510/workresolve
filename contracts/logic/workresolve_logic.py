"""
WorkResolve deterministic core logic — pure Python, ZERO dependency on the
`genlayer` runtime.

Why this file exists as a standalone module: a GenVM Intelligent Contract
must be a single, self-contained source file (confirmed from the bundled
GenLayer examples — `gl.deploy_contract` takes the entire contract source as
raw text; there is no confirmed mechanism for one deployed contract to
`import` a sibling helper module). That means `contracts/workresolve.py`
cannot literally `import` this file at runtime — its logic is embedded
directly in the contract, kept a deliberate, line-for-line mirror of the
functions below (each function in `workresolve.py` carries a comment
pointing back here).

The reason this module exists anyway, rather than just writing the logic
once inside the contract: everything in this file is pure, deterministic
Python with no dependency on the `genlayer` package (which is not
pip-installable — it's a placeholder name on PyPI; the real runtime is
provided by GenVM itself). That makes this module the one part of
WorkResolve's evaluation/escrow logic that can actually be executed and
unit-tested in a normal Python environment, without a running GenLayer
Studio instance. See contracts/tests_logic/ for the real, passing tests
against this module, and docs/contracts.md for why the equivalent logic
embedded in workresolve.py could not be executed the same way in this
environment.

Every function here is deliberately simple and side-effect-free so that
"kept identical between two files" is a realistic, checkable claim rather
than an aspiration.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REQUIREMENT_STATUSES = ("PASS", "FAIL", "PARTIAL", "UNVERIFIABLE")
DECISIONS = ("APPROVE", "REJECT")

MILESTONE_STATES = (
    "CREATED",
    "FUNDED",
    "ACCEPTED",
    "SUBMITTED",
    "EVALUATING",
    "APPROVED",
    "REJECTED",
    "RELEASED",
    "REFUNDED",
    "CANCELLED",
)

DEFAULT_APPROVAL_THRESHOLD = 70
MIN_APPROVAL_THRESHOLD = 1
MAX_APPROVAL_THRESHOLD = 100

MAX_REQUIREMENT_DESCRIPTION_LEN = 500
MAX_REQUIREMENT_REASON_LEN = 300
MAX_TITLE_LEN = 200
MAX_DESCRIPTION_LEN = 2048
MAX_EVIDENCE_ITEMS = 10
MAX_URL_LEN = 2048
ALLOWED_URL_SCHEMES = ("http://", "https://")


# ---------------------------------------------------------------------------
# Requirement canonicalization + commitment hash
# (mirrors src/lib/genlayer/canonical.ts on the frontend — see
# docs/contracts.md "Requirement Immutability" for why both sides need this)
# ---------------------------------------------------------------------------


def canonicalize_requirements(requirements: list[tuple[int, str, int]]) -> str:
    """requirements: list of (id, description, weight) tuples.
    Sorted by id ascending, joined as "id|description|weight" lines — this
    exact format must stay identical to the frontend's
    canonicalizeRequirements() in src/lib/genlayer/canonical.ts."""
    ordered = sorted(requirements, key=lambda r: r[0])
    lines = [f"{rid}|{description}|{weight}" for rid, description, weight in ordered]
    return "\n".join(lines)


def hash_requirements(requirements: list[tuple[int, str, int]]) -> str:
    """SHA-256 of the canonical form, as a 0x-prefixed hex string. Matches
    the frontend's hashRequirements() byte-for-byte (both use SHA-256 over
    the same canonical string), so a client/UI can independently verify a
    milestone's committed requirements without trusting the contract's UI."""
    canonical = canonicalize_requirements(requirements)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"0x{digest}"


def requirement_weights_sum_to_100(weights: list[int]) -> bool:
    return sum(weights) == 100


def validate_requirements(
    descriptions: list[str], weights: list[int]
) -> tuple[bool, str]:
    """Validates a proposed requirement set at milestone-creation time.
    Returns (is_valid, error_message)."""
    if len(descriptions) == 0:
        return False, "At least one requirement is required."
    if len(descriptions) != len(weights):
        return False, "Every requirement needs exactly one weight."
    for description in descriptions:
        if not description or not description.strip():
            return False, "Requirement description cannot be empty."
        if len(description) > MAX_REQUIREMENT_DESCRIPTION_LEN:
            return False, f"Requirement description exceeds {MAX_REQUIREMENT_DESCRIPTION_LEN} characters."
    for weight in weights:
        if weight < 1 or weight > 100:
            return False, "Each requirement weight must be between 1 and 100."
    if not requirement_weights_sum_to_100(weights):
        return False, f"Requirement weights must sum to 100 (got {sum(weights)})."
    return True, ""


# ---------------------------------------------------------------------------
# Submission URL validation
# (Phase 8 hardening — see docs/security.md finding C10 / F1-extended: the
# contract must not accept a submission whose evidence carries a dangerous
# URL scheme, since that value is later rendered as a clickable link by the
# frontend. Validated here, at submission time, rather than only trusted at
# render time — the contract is the one place every possible caller, not
# just this app's own form, must pass through.)
# ---------------------------------------------------------------------------


def is_safe_evidence_url(url: str) -> bool:
    """True only for a non-empty http(s) URL within MAX_URL_LEN. Anything
    else — javascript:/data:/file:/vbscript: schemes, a scheme-less string,
    or an oversized value — is unsafe to ever render as a clickable link."""
    if not url or len(url) > MAX_URL_LEN:
        return False
    lowered = url.lower()
    return lowered.startswith(ALLOWED_URL_SCHEMES)


def validate_submission_urls(
    deployed_url: str, repository_url: str, evidence_urls: list[str]
) -> tuple[bool, str]:
    """Validates every URL a freelancer submission carries. A URL field left
    empty is fine (deployed_url/repository_url are individually optional —
    see the "at least one" check at the call site); a URL field that is
    *present* must be a safe http(s) URL. Returns (is_valid, error_message)."""
    for label, url in (("Deployed URL", deployed_url), ("Repository URL", repository_url)):
        if url and not is_safe_evidence_url(url):
            return False, f"{label} must be a valid http(s) URL of at most {MAX_URL_LEN} characters."
    for i, url in enumerate(evidence_urls):
        if url and not is_safe_evidence_url(url):
            return False, f"Evidence URL #{i + 1} must be a valid http(s) URL of at most {MAX_URL_LEN} characters."
    return True, ""


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


def requirement_points(status: str, weight: int) -> int:
    """PASS = full weight. PARTIAL = half weight, rounded down. FAIL and
    UNVERIFIABLE both score 0 — this is the deterministic rule from
    docs/contracts.md "Handling UNVERIFIABLE": evidence that cannot be
    accessed or verified is NEVER treated as satisfying the requirement.
    It is scored identically to an outright FAIL, which is the safe
    default (ambiguity should never resolve in the freelancer's favor),
    while still being reported to the client/freelancer as a distinct
    UNVERIFIABLE status rather than a silent FAIL, so they can tell the
    difference between "didn't meet the bar" and "couldn't be checked"."""
    if status not in REQUIREMENT_STATUSES:
        raise ValueError(f"Unknown requirement status: {status!r}")
    if status == "PASS":
        return weight
    if status == "PARTIAL":
        return weight // 2
    return 0  # FAIL, UNVERIFIABLE


def compute_score(statuses_by_id: dict[int, str], weights_by_id: dict[int, int]) -> int:
    """Sum of per-requirement points. Because weights are validated to sum
    to exactly 100 at milestone creation (validate_requirements), this sum
    is already a 0-100 score with no further normalization needed."""
    return sum(
        requirement_points(statuses_by_id[rid], weights_by_id[rid])
        for rid in weights_by_id
    )


def decide(score: int, threshold: int) -> str:
    """The ENTIRE financial decision, in one deterministic comparison.
    Nothing upstream of this function is allowed to set `decision` — see
    docs/contracts.md "Consensus Result" for why the contract never lets
    an LLM's own stated decision/score reach this point directly."""
    return "APPROVE" if score >= threshold else "REJECT"


# ---------------------------------------------------------------------------
# Evaluator output validation
# (this is the "malformed evaluation" defense — see docs/contracts.md
# "Malformed Evaluation Handling")
# ---------------------------------------------------------------------------


@dataclass
class ValidationResult:
    is_valid: bool
    error: str = ""
    statuses_by_id: dict[int, str] | None = None
    reasons_by_id: dict[int, str] | None = None


def validate_evaluation_payload(payload: object, required_ids: list[int]) -> ValidationResult:
    """Validates a parsed (already-JSON-decoded) evaluator response against
    the exact set of requirement ids that were sent to the evaluator.

    Deliberately does NOT trust (or even read) any "score" or "decision"
    field the evaluator might include — see decide()/compute_score() above,
    which are the only source of those values. This keeps the untrusted
    surface to exactly one thing: "which status did the evaluator assign to
    each requirement, and why" — nothing else the evaluator says can affect
    contract behavior.

    Rejects (is_valid=False) on: non-dict payload, missing "requirements"
    key, a "requirements" value that isn't a list, any item missing "id"/
    "status"/"reason", any status outside the four allowed values, any id
    not an int, a required id that's missing, a required id that appears
    more than once (duplicate), or an id that isn't in required_ids at all
    (fabricated/extra requirement) — this is the "never invent missing
    evidence" / "never fabricate a requirement" rule from docs/contracts.md.
    """
    if not isinstance(payload, dict):
        return ValidationResult(False, "Evaluator output must be a JSON object.")

    requirements = payload.get("requirements")
    if not isinstance(requirements, list):
        return ValidationResult(False, "Evaluator output missing a \"requirements\" array.")

    required_id_set = set(required_ids)
    seen_ids: set[int] = set()
    statuses_by_id: dict[int, str] = {}
    reasons_by_id: dict[int, str] = {}

    for item in requirements:
        if not isinstance(item, dict):
            return ValidationResult(False, "Each requirement result must be a JSON object.")

        rid = item.get("id")
        status = item.get("status")
        reason = item.get("reason", "")

        # `bool` is a subclass of `int` in Python (isinstance(True, int) is
        # True), so an isinstance-only check would let a JSON `true`/`false`
        # id silently coincide with integer id 1/0. Excluded explicitly
        # (Phase 8 hardening) rather than relying on isinstance alone.
        if not isinstance(rid, int) or isinstance(rid, bool):
            return ValidationResult(False, f"Requirement id must be an integer, got {rid!r}.")
        if rid not in required_id_set:
            return ValidationResult(False, f"Requirement id {rid} was not part of this milestone.")
        if rid in seen_ids:
            return ValidationResult(False, f"Duplicate result for requirement id {rid}.")
        seen_ids.add(rid)

        if status not in REQUIREMENT_STATUSES:
            return ValidationResult(
                False, f"Invalid status {status!r} for requirement {rid} — must be one of {REQUIREMENT_STATUSES}."
            )
        if not isinstance(reason, str):
            return ValidationResult(False, f"Reason for requirement {rid} must be a string.")

        statuses_by_id[rid] = status
        reasons_by_id[rid] = reason[:MAX_REQUIREMENT_REASON_LEN]

    missing = required_id_set - seen_ids
    if missing:
        return ValidationResult(False, f"Evaluator output is missing requirement id(s): {sorted(missing)}.")

    return ValidationResult(True, statuses_by_id=statuses_by_id, reasons_by_id=reasons_by_id)


# ---------------------------------------------------------------------------
# State machine (mirrors docs/contracts.md's transition table exactly —
# these are the same guards embedded in workresolve.py's contract methods)
# ---------------------------------------------------------------------------

# Each action maps to the set of states it's legal to run from.
ALLOWED_SOURCE_STATES: dict[str, tuple[str, ...]] = {
    "fund": ("CREATED",),
    "accept": ("FUNDED",),
    "submit": ("ACCEPTED", "SUBMITTED"),  # SUBMITTED allowed: resubmission before evaluation starts
    "evaluate_and_finalize": ("SUBMITTED",),
    "release_payment": ("APPROVED",),
    "refund_client": ("REJECTED",),
    "cancel": ("CREATED", "FUNDED", "ACCEPTED"),
}


def can_transition(current_state: str, action: str) -> bool:
    if action not in ALLOWED_SOURCE_STATES:
        raise ValueError(f"Unknown action: {action!r}")
    return current_state in ALLOWED_SOURCE_STATES[action]


def next_state_after(action: str, decision: str | None = None) -> str:
    """Pure lookup of the destination state for an action. `decision` is
    only consulted for evaluate_and_finalize."""
    if action == "fund":
        return "FUNDED"
    if action == "accept":
        return "ACCEPTED"
    if action == "submit":
        return "SUBMITTED"
    if action == "evaluate_and_finalize":
        if decision not in DECISIONS:
            raise ValueError(f"decision must be one of {DECISIONS}, got {decision!r}")
        return "APPROVED" if decision == "APPROVE" else "REJECTED"
    if action == "release_payment":
        return "RELEASED"
    if action == "refund_client":
        return "REFUNDED"
    if action == "cancel":
        return "CANCELLED"
    raise ValueError(f"Unknown action: {action!r}")


# ---------------------------------------------------------------------------
# Deadline / cancellation rules
# (mirrors cancel_milestone() in contracts/workresolve.py — see
# docs/contracts.md "Deadline & Timeout Handling". Timestamp source: GenVM
# contract code calls `datetime.now()` directly and compares against the
# stored deadline, per the confirmed pattern in GenLayer's bundled
# `intelligent_oracle.py` example — see workresolve.py's `_now_unix()`
# docstring for the full reasoning. This module stays free of any datetime
# dependency itself so it can keep being pure/deterministic-only; callers
# pass in `now_unix` and `deadline_unix` as plain ints.)
# ---------------------------------------------------------------------------


def can_cancel_from_accepted(now_unix: int, deadline_unix: int) -> bool:
    """A client may only cancel an ACCEPTED milestone once its deadline has
    passed — this protects a freelancer who is still within the agreed
    window from being cancelled out from under them."""
    return now_unix >= deadline_unix


def refund_applies_on_cancel(state_before_cancel: str) -> bool:
    """Funds are locked in escrow from FUNDED onward (ACCEPTED always
    implies FUNDED happened first), so cancelling from either state must
    refund the client. Only CREATED has no funds to return. (This was a
    real bug caught and fixed during Phase 4: an earlier draft of
    workresolve.py's cancel_milestone() only refunded when cancelling from
    FUNDED, silently stranding a client's escrowed funds if they cancelled
    after ACCEPTED-plus-deadline — see TestDeadlineCancellation below.)"""
    return state_before_cancel in ("FUNDED", "ACCEPTED")

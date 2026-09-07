# WorkResolve Intelligent Contract

This directory holds the WorkResolve GenVM Intelligent Contract and everything needed to work on
and test it. It's at the repository root, not under `src/`, because it's a separately-deployed
artifact with its own toolchain (GenLayer Studio / a testnet node, `gltest`), not part of the
Next.js build — see `docs/architecture.md` sections 4, 19.

## Layout

```
contracts/
  workresolve.py            # The actual deployable contract (single self-contained file — see
                             # its own module docstring for why GenVM requires this).
  requirements.txt          # Python deps for working in this directory (gltest, pytest).
  logic/
    workresolve_logic.py    # Pure-Python mirror of workresolve.py's deterministic core, with ZERO
                             # dependency on the (not pip-installable) `genlayer` package. This is
                             # the part of the contract's logic that can be — and is — really
                             # executed and unit-tested in a normal Python environment.
  tests_logic/
    test_workresolve_logic.py   # REAL, executed pytest suite against logic/workresolve_logic.py.
                                 # Run: python3 -m pytest contracts/tests_logic -v
                                 # Last verified result: 65/65 passing.
  tests/
    test_workresolve.py     # gltest-based integration tests against the REAL deployed contract.
                             # Written against gltest's real, confirmed API but NOT executable in
                             # this development sandbox — see "Known Limitations" below and that
                             # file's own module docstring for exactly why, and how to run it for
                             # real.
```

## Why the logic is duplicated between two files

GenVM deploys a contract from its raw source text (`gl.deploy_contract(code=..., ...)` takes a whole
file's contents in every confirmed example) — there is no confirmed mechanism for a deployed
contract to `import` a sibling Python module. So `workresolve.py` must be fully self-contained, and
its deterministic helper methods (`_canonicalize_requirements`, `_hash_requirements`,
`_requirement_points`, `_decide`, `_validate_evaluation_payload`) are a deliberate, line-for-line
mirror of the equivalent functions in `logic/workresolve_logic.py` — each one says so in its
docstring, pointing back the other way. `logic/workresolve_logic.py` exists specifically so this
logic is genuinely, mechanically testable without a GenVM runtime; `workresolve.py`'s copy is not
independently tested, by construction, so the mirror relationship is the thing keeping it honest.

## How to run the tests that actually run here

```bash
pip install -r contracts/requirements.txt --break-system-packages   # pytest + gltest
python3 -m pytest contracts/tests_logic -v
```

This exercises every deterministic rule in the contract — canonicalization, the commitment hash,
weighted scoring (including the UNVERIFIABLE-never-scores-as-PASS rule), the APPROVE/REJECT
threshold decision, every malformed-evaluator-output rejection case, the full state-transition
table, double-settlement protection, and deadline-based cancellation — without needing a GenVM
runtime. It does not exercise `evaluate_and_finalize`'s actual `gl.exec_prompt`/`gl.get_webpage`
calls, contract deployment, or fund transfers, because those genuinely require a live GenVM network.

## How to run the tests that need a live network (not run in this environment)

```bash
pip install -r contracts/requirements.txt --break-system-packages
gltest run                                    # against a local GenLayer Studio simulator, or
gltest run --rpc-url <your-testnet-rpc-url>   # against a public testnet
```

`contracts/tests/test_workresolve.py` covers milestone creation, funding, acceptance, submission
(including resubmission), evaluation and settlement (including a direct prompt-injection defense
test), deadline-gated cancellation, double-settlement protection, and one full end-to-end lifecycle
integration test. It was written against `gltest`'s real, version-pinned API (`get_contract_factory`,
`ContractFactory.deploy`, `Contract.connect`, `tx_execution_succeeded`/`tx_execution_failed`, the
`args=[...]`/`value=...` calling convention) — all confirmed by inspecting the installed
`genlayer-test==0.1.1` package's own source and bundled example tests directly, not guessed from
documentation. See its module docstring for why it could not be executed here and how to run it for
real.

## Known Limitations (this development environment)

- No reachable Docker daemon (`docker version` fails with a connection-refused error), so
  `genlayer init`'s local Studio simulator could not be started.
- No direct network egress from shell commands to `docs.genlayer.com`/`studio.genlayer.com`
  (organization/agent-proxy policy). `WebFetch`/`WebSearch` tool calls use a different network path
  and did work for targeted documentation lookups during research.
- Consequence: `contracts/tests/test_workresolve.py` has never been executed from this environment
  (the contract itself has since been deployed to GenLayer's Asimov Testnet from a machine with real
  network access — see `docs/genlayer-integration.md`). See `docs/contracts.md` "Known Limitations"
  for the full, itemized list of what remains unverified as a result (most notably: the outbound
  transfer mechanism, `_pay_out()` / `_ExternalRecipient(...).emit_transfer(value=...)` — matching
  GenLayer's documented API after a reviewer flagged the earlier invented `gl.ContractAt(...)` call —
  and the exact cross-validator reconciliation of `datetime.now()`-based timestamps).

## API sources

Every GenLayer API this contract uses was taken from real, installed, version-pinned packages
inspected directly during Phase 4 — not assumed from documentation prose. See
`docs/architecture.md`'s "Phase 4 API corrections" section for the full list of what this corrected
from Phase 1/2's assumptions, and `docs/contracts.md` for the contract's full design, state machine,
and security review.

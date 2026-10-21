# PhiVibe R11: behavioral test vectors between Vibe intent and PhiThon execution

PhiThon and Vibe remain **different languages**. R9 source links and R10 proof-report correspondence do not show that a PhiThon implementation behaves as the Vibe contract intends. R11 introduces a small, evidence-first **human-authored behavioral fixture** to test a selected collection of concrete inputs and expected outputs in PhiThon.

## The workflow

1. Create a Vibe `.vibe` intent contract, then generate Vibe's real Phase 8.4 `intent-brief` JSON with `vibec intent-brief <file.vibe> --report json --write-output <intent.json>`.
2. Write a corresponding PhiThon program that declares exactly one top-level function, for example `fn evaluate(x) { return x * 2 }`.
3. Use R9 `vibe-link` to bind the exact source bytes of both independent programs and any PhiPack modules. It does not prove equivalence.
4. Write a **human-reviewed** `phithon.vibe-behavior-vectors.v1` manifest declaring an entry function, the Vibe intent name and up to eight fixed expected outputs.
5. Run **only the selected cases**, one per separate bounded PhiShield child process. Each program is validated against the current R9 source link **before any execution**.

Example using the included synthetic `examples/vibe-behavior/` pair:

~~~sh
# Vibe toolchain, separate from PhiThon:
vibec intent-brief examples/vibe-behavior/contract.vibe --report json --write-output intent-brief.json

# PhiThon CLI:
npm run phi -- vibe-link intent-brief.json examples/vibe-behavior/contract.vibe examples/vibe-behavior/implementation.phi --out source-link.json

npm run phi -- vibe-behavior source-link.json intent-brief.json examples/vibe-behavior/contract.vibe examples/vibe-behavior/implementation.phi examples/vibe-behavior/vectors.json --out behavior-report.json
~~~

No Python execution is invoked from PhiThon. A Vibe spec is only an independently authored intent statement; Vibe did **not** automatically derive or certify the expectations.

## Vector manifest

~~~json
{
  "schema": "phithon.vibe-behavior-vectors.v1",
  "intentName": "PhiDouble",
  "entryFunction": "evaluate",
  "provenance": "OPERATOR_SELECTED_EXPECTATIONS_UNATTESTED",
  "cases": [
    { "id": "zero", "inputs": [0], "expectedOutput": "0" },
    { "id": "positive", "inputs": [21], "expectedOutput": "42" },
    { "id": "negative", "inputs": [-3], "expectedOutput": "-6" }
  ]
}
~~~

Every case must have exactly the number and basic types of inputs declared in Vibe's intent brief. Supported input types in R11: `number`, `string`, `bool`/`boolean`. The intent must declare **one output**. `entryFunction` must refer to a real top-level `fn` definition with matching parameter arity. Cases are not arbitrary PhiThon snippets: they contain only bounded literal values serialized safely into a fixed `print(entry(...))` test harness.

The implementation is run with `brainGrant:false`. No Ollama dispatch, network call, SPV grant or Vibe compiler invocation is part of behavioral testing.

## Strict result criteria

- Each test runs in a *fresh* Node child under PhiShield's existing maximum instruction count, heap budget, output ceiling and 2.5-second wall-clock limit.
- An exact **single stdout line** must match `expectedOutput`. Extra output lines or differing whitespace are a mismatch. A thrown error/timeout yields `ERROR`, not PASS.
- A test suite reports either `ALL_SELECTED_CASES_MATCH` or `SELECTED_CASES_NOT_ALL_MATCHED`. A mismatch or error causes a nonzero CLI exit after saving the report.
- The output report contains **SHA-256 digests** of expected/observed one-line text, input arrays, harnessed exact source, original R9 link and the manifest. Raw input vectors and actual outputs are not written into the report.
- The report is saved with exclusive file creation `wx` and mode `0600` on POSIX; existing reports are never silently replaced.

These hashes are **self-consistency evidence only**. A reader cannot infer that a test result is authentic, that execution occurred on trusted hardware or that the input data were independently verified.

## Limits and governance

**Even 8/8 passing cases is not evidence of exhaustive semantic equivalence.** It proves only that the particular supplied input/output examples matched in the tested PhiThon execution environment. Vibe's full preservation obligations may cover different or untested behavior.

R11 never marks `intentPreservationProven`, `semanticEquivalenceVerified`, `exhaustiveCoverageProven`, `vibeVerifierRun` or `modelRoutingApproved` true.

PhiShield is a bounded **availability** mechanism, not a hardened OS security sandbox for malicious source. Test only code you trust. Sources, vectors, modules and imported Vibe metadata can contain personal or sensitive information. Generated reports use redacted hashes by default but can still reveal identifiers, counts and timing-related patterns.

Future work can add bounded property tests, operator-chosen Vibe verification obligations and provenance checks. A separate independent verifier would be required before source-linked test matches could become a trustworthy cross-language preservation claim.

**Ledger above ego. Match a case, record the match. Don't pretend that constitutes universal truth.**

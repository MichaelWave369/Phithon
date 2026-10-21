# PhiVibe R12: deterministic finite property testing

R12 complements R11's hand-picked examples with **operator-declared properties over deterministic bounded inputs**. The properties are not generated or certified by Vibe's verifier.

## Demo workflow

Create a real `phase-8.4.intent-brief.v1` using the separately installed Vibe CLI, then bind the exact source files using PhiThon's existing R9 link:

~~~sh
vibec intent-brief examples/vibe-behavior/contract.vibe --report json --write-output intent-brief.json
npm run phi -- vibe-link intent-brief.json examples/vibe-behavior/contract.vibe examples/vibe-behavior/implementation.phi --out source-link.json
npm run phi -- vibe-properties source-link.json intent-brief.json examples/vibe-behavior/contract.vibe examples/vibe-behavior/implementation.phi examples/vibe-behavior/properties.json --out property-report.json
~~~

The included plan `examples/vibe-behavior/properties.json` tests `fn evaluate(x)` on six deterministic numbers.

## Manifest

~~~json
{
  "schema": "phithon.vibe-property-plan.v1",
  "intentName": "PhiDouble",
  "entryFunction": "evaluate",
  "provenance": "OPERATOR_DECLARED_PROPERTY_UNATTESTED",
  "seed": 369,
  "minInput": -12,
  "maxInput": 12,
  "samples": 6,
  "property": {"kind": "affine", "factor": 2, "offset": 0}
}
~~~

R12 requires **one numeric input** and **one numeric output** in the Vibe intent brief, with a real unary top-level PhiThon function. It supports these property kinds:

| Property | Meaning |
| --- | --- |
| `affine` | Numeric output exactly equals factor × input + offset; integer coefficients in [-100,100] |
| `nonnegative` | Every sampled output is ≥ 0 |
| `monotonic_nondecreasing` | Outputs do not decrease as sampled input increases; missing comparisons are inconclusive |
| `repeatable` | Two independent child executions of the same input return equal finite numeric values |

No arbitrary expressions, host permissions, dynamic JavaScript, network requests or Vibe code interpretation are accepted as properties.

## Sampling and runtime constraints

- Seed is an explicit unsigned nonzero 32-bit integer. Domain endpoints are integers bounded to [-1000,1000], and minimum must be below maximum.
- Three to twelve unique samples are selected. Both endpoints and zero (when within the range) are included, then seeded xorshift32 fills remaining samples, with a deterministic fallback for excessive collisions. Monotonic samples are sorted.
- Every sampled input executes via a **fresh bounded PhiShield child**, with `brainGrant:false`, a 2.5-second deadline, step, output and heap limits. Repeatability requires **two separate child runs**.
- The R9 link is checked against **all** original source/module hashes before test execution; a changed implementation is refused.
- Output must be exactly one finite numeric line. Errors, malformed output and missing neighboring observations cannot pass silently.
- The report is written exclusively, never overwritten by reusing an output filename. It records SHA-256 input/observed/harness/manifest hashes rather than raw values.
- A failed or inconclusive test produces a nonzero CLI exit code after a report is written.

PhiShield is not a hardened OS sandbox. Run only code you trust.

## Truthfulness and governance

`ALL_SAMPLED_CHECKS_MATCH` means only that the **finite selected samples matched the operator's declared property**. It is not full Vibe preservation verification, semantic equivalence across languages, exhaustive testing, a formal theorem, a model-routing grant, cryptographic execution attestation or a trusted third-party report.

The output always includes:

~~~json
{
  "exhaustiveCoverageProven": false,
  "crossLanguageSemanticEquivalenceVerified": false,
  "vibePreservationProven": false,
  "vibeVerifierInvoked": false,
  "modelRoutingApproved": false
}
~~~

**Ledger above ego: observed matches are evidence; they are not universal proof.**

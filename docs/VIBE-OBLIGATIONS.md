# PhiVibe R13: sampled obligation-to-evidence ledger

**This is a read-only cross-reference, not cross-language certification.** Vibe's own Phase 8.4 `proof-brief` exports at most ten obligation sample entries, each containing an obligation ID, category, reported status and criticality. R13 allows an operator to explicitly associate those IDs with earlier PhiThon R11 behavioral observations or R12 deterministic property observations.

It never turns a *reported* result into an authenticated source of truth. It never invokes Vibe, PhiThon, SPV, Ollama, or another model.

## Workflow

Generate the following artifacts using their established commands:

- R9 source-linked record: `link.json`, plus real `intent-brief.json`, `contract.vibe`, `implementation.phi`
- R10: Vibe's original Phase 8.4 `proof-brief.json` and the existing PhiThon `correspondence.json`
- R11: `behavior-report.json` from `vibe-behavior`
- R12: `property-report.json` from `vibe-properties`

Then write an explicit binding file by inspecting the *actual* `obligations_sample[]` IDs in the Vibe proof brief. The sample below is **illustrative only**; it is not an authentic ID guarantee from the compiler:

~~~json
{
  "schema": "phithon.vibe-obligation-bindings.v1",
  "provenance": "OPERATOR_CHOSEN_ASSOCIATION_UNATTESTED",
  "bindings": [
    {
      "obligationId": "preserve.determinism",
      "evidence": [
        { "type": "behavior", "caseId": "positive" },
        { "type": "property", "sampleIndex": 1 }
      ]
    }
  ]
}
~~~

A behavior `caseId` must already exist in the R11 behavior report. A property `sampleIndex` is **1-based** into the R12 property report, and must already exist. The same reported test can be referenced by multiple obligations, but the relationship is always a *human-declared association*. An obligation can exist without any associated evidence.

Run from the PhiThon repository:

~~~sh
npm run phi -- vibe-obligations proof-brief.json correspondence.json link.json intent-brief.json contract.vibe implementation.phi behavior-report.json property-report.json bindings.json --out evidence-ledger.json
~~~

The new command:

1. Revalidates the R10 correspondence against the current R9 link, original Vibe/PhiThon source bytes and registered PhiPack modules.
2. Confirms that both R11 and R12 reported results refer to the same source-link hash, source SHA-256 hashes and module source hashes.
3. Validates reported row IDs, sample counts and status totals, rejecting contradictions or invalid pass/authority flags.
4. Refuses invalid, duplicate or nonexistent obligation IDs, case IDs and property sample indices.
5. Creates a **new file exclusively** with an obligation-by-obligation report; it never silently overwrites a previous record.

## Report semantics

Each *sampled* Vibe obligation has two independent labels:

- `vibeReportedStatus`: copied from Vibe's **self-reported**, unsigned Phase 8.4 proof brief. The originating verifier/proof file is not independently authenticated.
- `associationStatus`: based on the operator's selection of R11/R12 observed test rows. Possible values:

| Association status | Meaning |
| --- | --- |
| `NO_ASSOCIATION` | No test observations were selected for the obligation |
| `REPORTED_SAMPLE_MATCHES` | Every selected observation reports a match |
| `REPORTED_MISMATCH` | One or more selected observations reports a mismatch |
| `INCOMPLETE_OR_ERROR` | At least one selected observation is an error or inconclusive |

These two labels may disagree; **R13 preserves disagreements** and does not silently change the Vibe status or declare the property verified. The ledger also records:

- `obligationsTotalReported`: full count *claimed by Vibe*;
- `obligationsInProofSample`: number actually present in the compact proof brief;
- `obligationsOmittedFromProofSample`: any unexported obligations, **not assumed covered**;
- `unresolvedSampledObligations`: number of sampled obligations without exclusively reported matching associations.

Passing selected samples does not mean all associated Vibe obligations have been addressed. The test sets are finite, may have been operator-selected to show good results, and do not establish causal coverage or full semantic equivalence.

## Provenance/security

R13 does not execute untrusted source, invoke either runtime, use a model, change PhiShield grants or promote ledger trust. It is **not an independent verifier** of the previous reports. A malicious operator may forge internally consistent JSON data, which remains unauthenticated. SHA-256 only binds the selected files' bytes.

Output rows include obligation IDs, categories, reported status, evidence IDs, and observed hashes. No raw source code, input vector, output text, private source paths, obligation descriptions or hidden notes are copied.

Even if every sampled row reports a match, the ledger ALWAYS records:

~~~json
{
  "reportsIndependentlyAuthenticated": false,
  "evidenceExecutionIndependentlyAttested": false,
  "semanticCoverageEstablished": false,
  "intentPreservationProven": false,
  "crossLanguageEquivalenceVerified": false,
  "modelRoutingApproved": false
}
~~~

**Ledger above ego. A checked sample is a checked sample, not a proof of all things.**

# PhiBridge R8: read-only SuperPhiVessel Evidence Bench compatibility

PhiBridge is the **first implementation-level interoperation** between PhiThon and the existing public SuperPhiVessel repository. It accepts a **manually exported** redacted portable Evidence Bench v0.1 JSON produced by the SPV Windows Local Console.

**SPV source contract inspected:**
- [portable-bench.mjs](https://github.com/MichaelWave369/SuperPhiVessel/blob/main/packages/vessie-local-console/ui/portable-bench.mjs)
- [portable Evidence Bench operator guide](https://github.com/MichaelWave369/SuperPhiVessel/blob/main/packages/vessie-local-console/PORTABLE_BENCH_GUIDE.md)

This is **not** a new SPV model-execution API, a live Vessie connection, a BrainC route, a model-grant service, a model training signal, or a verification of the claims inside a receipt.

## 1. Export from SuperPhiVessel

On your own computer, open SPV's **Portable Windows Local Console**. In its Local Evidence Bench, use **Save portable bench JSON** after you have manually chosen local redacted records. The file is typically named `vessie-local-evidence-bench-portable.json`.

The format is `superphivessel.local-console.evidence-bench.bundle.v0.1` and includes up to 24 redacted normalized entries, not raw prompts or model answers.

Only import files you intentionally selected. Do not upload this private file to the GitHub repo. Though redacted, model labels, timestamps, performance observations and self-reports may still reveal private context.

## 2. Inspect locally in PhiThon

In the browser playground, look for **ΦBRIDGE / SPV EVIDENCE** and select the exported file. PhiThon validates the JSON locally in memory and shows:

- number of evidence entries, performance observations, human reviews and distinct reported model labels;
- number of performance rows with a matching human review by **exact model name plus output SHA-256**;
- chronological observations with reported generation tokens, timestamp and matching-review status, **with model labels redacted**.

There is **no model inference, automatic model ranking, route authorization, network upload, localStorage persistence or source code execution** from the imported JSON.

The browser stores only an inspection summary and discards the parsed source object when the handler returns. **Clear inspection** removes that summary.

## 3. Node CLI

```sh
npm run phi -- spv-bench-inspect examples/spv-evidence-bench.SYNTHETIC.json

# For an operator-owned export:
npm run phi -- spv-bench-inspect /path/to/vessie-local-evidence-bench-portable.json

# Explicitly reveal recorded model labels in your local terminal:
npm run phi -- spv-bench-inspect /path/to/vessie-local-evidence-bench-portable.json --models
```

The CLI only reads this operator-selected file and prints bounded, descriptive JSON. It creates no other files and has **no dispatch or execution hooks**. Model names remain redacted unless `--models` is explicitly selected.

## 4. Schema and refusal policy

R8 mirrors the upstream strict allowlisted shape in `portable-bench.mjs`:
- At most 64 KiB UTF-8 per bundle; 1–24 distinct entries.
- Exact known top-level keys and expected provenance, scope, authority and privacy flags.
- Exact `PERFORMANCE_RECEIPT` fields, with the upstream optional `protocol_id`. Only the three currently public fixed-protocol IDs are accepted.
- Exact `HUMAN_REVIEW` fields, self-reported usefulness/completeness/check category allowlists.
- Observed timestamps must be canonical ISO-8601; hashes must be lowercase SHA-256 hex.
- Fields containing prompts, full answers, notes, credentials, extra metadata or approval claims are refused, never copied into the summary.
- Duplicate evidence identity (kind, model, output hash, observed timestamp) is refused rather than guessed away.
- Performance/review linking uses the pair of **model label + output hash**, never a model name alone.
- Rows are chronological, not sorted by speed, scores, rating or recommendation.

The upstream document is an **operator-selected report, unauthenticated by default**. Its source could have been manually altered or forged. Schema validation alone cannot prove authenticity, accurate timings, model identity, physical locality or truthful human ratings.

## 5. Hard governance boundary

Neither a valid bundle nor a matching human-review record can authorize:
- running, selecting, ranking, installing, routing or approving AI models;
- BrainC/GA108 promotion, P4 learning, regression reward, adaptive weights, memory promotion or cloud usage;
- PhiThon `brain.requests` execution grants;
- browser-to-localhost network permissions;
- changing SPV's Vessie runtime, operator keyring or routing thresholds.

The existing PhiBrain R7 Ollama `dispatch-local` workflow remains a **separate**, explicitly authorized command. Importing an SPV Evidence Bench neither grants that permission nor contacts Ollama.

**Provenance label:** `UNATTESTED_OPERATOR_SELECTED_JSON`. If future verified signatures are supported, that will require an explicit separately reviewed cryptographic validation protocol. No `VERIFIED` status is earned here.

## 6. Boundaries and tests

This is compatible with the documented and inspected **SPV portable bench v0.1 schema only**, not every possible SPV archive or the R3-E signed canonical routing envelope. A later SPV release could legitimately change its export schema, at which point the importer must be updated and retested. R8 intentionally fails closed on unknown versions.

CI uses a **clearly synthetic fixture**, not the user's actual private model observations or a live SPV service. Tests check normal imports, privacy rejection, approval spoofing, duplicate entries, forged human ratings, chronological matching, input size and command-line redaction. Browser build checks that the same pure validator can be used without Node APIs.

**Ledger above ego:** SPV can tell PhiThon what a human exported without PhiThon pretending it has authority to decide what should run.

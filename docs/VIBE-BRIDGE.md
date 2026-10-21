# PhiVibe R9: intent-first Vibe ↔ executable PhiThon linkage

**Source-grounded interoperability, not syntax translation.** PhiThon is an independent small interpreted language; Vibe is a separate Python-implemented intent-first compiler. Vibe also has a guided Python layer called **PhiPython**, which is neither PhiThon nor a compatible runtime.

This bridge follows Vibe's actual [Phase 8.4 intent brief](https://github.com/MichaelWave369/Vibe/blob/main/vibe/interchange.py) rather than inventing a protocol.

- Vibe input: an independently generated `phase-8.4.intent-brief.v1` JSON artifact, plus the original `.vibe` source.
- PhiThon input: a separate `.phi` implementation candidate and any local PhiPack `.phi` library sources.
- Output: `phithon.vibe-intent-link.v1` JSON with exact SHA-256 source digests and explicit `HUMAN_DECLARED_IMPLEMENTATION` status.
- This does **not** compile Vibe, translate syntax, invoke Python, execute PhiThon, verify Vibe's proof obligations or establish cross-language semantic equivalence.

## Generate a real Vibe intent brief

Use an existing Vibe checkout and its own documented CLI.

~~~sh
vibec intent-brief examples/vibe-contract/hello.vibe --report json --write-output intent-brief.json
~~~

You may need to use an absolute path to `hello.vibe` when running `vibec` from the Vibe repository. `vibec` is **not installed or bundled** by PhiThon. You can use Vibe's own `verify` and `verify-proof` tools separately; running `intent-brief` **does not imply verification passed**.

## Inspect it in the browser

The PhiThon playground now has **ΦVIBE / INTENT BRIDGE**. Manually select the Vibe intent-brief JSON. The browser parses its allowlisted Phase 8.4 schema and shows intent name, goal, typed input/output declarations, preserve and constraint counts, and the **claimed** Vibe source SHA-256.

Importing the brief **does not check the original .vibe file**. The browser does not run Vibe or automatically generate corresponding PhiThon source. It stores only the sanitized inspection view in React state, not the original private `source_path` value.

## Bind original sources offline

From a PhiThon checkout:

~~~sh
npm run phi -- vibe-inspect intent-brief.json

npm run phi -- vibe-link intent-brief.json examples/vibe-contract/hello.vibe examples/vibe-contract/hello.phi --out vibe-phithon-link.json

npm run phi -- vibe-link-check vibe-phithon-link.json intent-brief.json examples/vibe-contract/hello.vibe examples/vibe-contract/hello.phi
~~~

`vibe-link` refuses to create a link unless the **exact UTF-8 bytes** of the supplied `.vibe` source SHA-256-match `source_sha256` inside the Vibe brief. This is anchored to [Vibe's real SHA-256 source-hashing behavior](https://github.com/MichaelWave369/Vibe/blob/main/vibe/cache.py). It also parses PhiThon source and local import graphs, without running any statements. If the PhiThon entry is accompanied by `phithon.pack.json`, it includes a sorted map of SHA-256 hashes of all registered module source files.

The link is written with exclusive file creation: it will not silently overwrite an existing link. No external process runs, no model is called, no network activity occurs, and no execution authority is granted.

The `vibe-link-check` command recomputes all source hashes and compares all declared metadata against the saved link. Modifying the Vibe file, the PhiThon entry source, or a registered PhiPack module invalidates an earlier link.

### Example output shape

~~~json
{
  "schema": "phithon.vibe-intent-link.v1",
  "relationship": "HUMAN_DECLARED_IMPLEMENTATION",
  "vibe": {
    "briefVersion": "phase-8.4.intent-brief.v1",
    "intentName": "PhiHello",
    "sourceSha256": "<actual SHA-256 hex>"
  },
  "phithon": {
    "sourceSha256": "<actual SHA-256 hex>",
    "moduleHashes": {}
  },
  "verification": {
    "vibeBriefSourceHashMatched": true,
    "phithonSyntaxAndDependencyGraphParsed": true,
    "vibeVerificationPerformed": false,
    "semanticEquivalenceVerified": false,
    "phithonExecuted": false,
    "intentPreservationProven": false
  },
  "executionAuthorized": false,
  "routingApproved": false,
  "provenance": "OPERATOR_SELECTED_UNATTESTED"
}
~~~

**Hashes only bind bytes:** A fabricated brief plus a fabricated spec with matching digests could produce an internally consistent link. No signer authentication, trusted time, compiler attestation or proof of behavior exists in R9. Do not treat the link as sufficient to promote any Vibe proof status, PhiLedger provenance, model quality, BrainC routing approval, execution policy or training data.

## Future interoperability ladder

1. **R9:** Vibe intent inspection + hash-bound declared PhiThon implementation (this PR).
2. **Later:** A separate, reviewed `vibec verify --report json` and `proof-brief` schema importer with proof-source correspondence and **no automatic promotion**.
3. **Later:** Operator-reviewed trace fixtures that feed PhiThon input/output tests and Vibe preservation constraints without equating names with semantics.
4. **Later:** A scoped compiler/emitter or adapter, only for constructs whose behavior is independently tested and precisely defined.
5. **Only then:** Independently qualified cross-language preservation reports, explicit approvals, and reproducible benchmarks.

**Ledger above ego:** Vibe defines intended obligations; PhiThon may implement them. Their names, hashes and proximity do not make that relationship true without actual evidence.


## R10: Vibe proof-report correspondence

R10 adds a **second, independent artifact**, based on Vibe's own
[Phase 8.4 build_proof_brief](https://github.com/MichaelWave369/Vibe/blob/main/vibe/interchange.py)
function and
[Vibe's proof artifact builder](https://github.com/MichaelWave369/Vibe/blob/main/vibe/proof.py).

The Vibe proof brief schema is `phase-8.4.proof-brief.v1`. It includes:
- `intent_summary.source_hash`: SHA-256 of the original .vibe source as reported by Vibe.
- `verification_backend` and `result.passed`: the **reported** backend and pass/fail status.
- `preserve_constraint_summary`, `bridge_result`, and `equivalence_drift_summary`: bounded descriptions of Vibe's own reported analyses.
- `interchange_metadata`: flags confirming this document is a deterministic projection **of an earlier Vibe proof artifact**, not an independently authenticated witness.

You must first generate a Vibe proof artifact using Vibe itself, then export the brief:

~~~sh
# In your separately installed Vibe toolchain:
vibec verify-proof examples/vibe-contract/hello.vibe
vibec proof-brief examples/vibe-contract/hello.vibe.proof.json --report json --write-output proof-brief.json

# In PhiThon:
npm run phi -- vibe-proof-inspect proof-brief.json

npm run phi -- vibe-proof-link vibe-phi-link.json proof-brief.json intent-brief.json examples/vibe-contract/hello.vibe examples/vibe-contract/hello.phi --out proof-correspondence.json

npm run phi -- vibe-proof-link-check proof-correspondence.json vibe-phi-link.json proof-brief.json intent-brief.json examples/vibe-contract/hello.vibe examples/vibe-contract/hello.phi
~~~

The CLI re-checks the R9 link against **actual .vibe, .phi and declared PhiPack files**, then confirms that the proof brief reports the **same Vibe source hash**. It records a second source-linked file with `phithon.vibe-proof-correspondence.v1` schema, including a SHA-256 of the supplied proof brief and original R9 link. The file is exclusively created and cannot silently overwrite another report.

**Critical limit:** a proof brief could be forged in text. Even when it says Vibe passed, R10 does **not** re-run `vibec`, authenticate a signed proof, independently validate the proof artifact, or verify that .phi executes the intended contract. It merely links the imported **reported** Vibe outcome to sources whose current bytes match the original declaration.

The browser has a separate, local-only Vibe proof-brief reader. It displays `VIBE REPORTED PASS` or `VIBE REPORTED FAIL`, not `PHITHON CERTIFIED` or an automatic approval. No raw proof artifact, private path, untrusted obligations text, or hidden keys are retained in the read-only summary.

The following claims are **always false** in the R10 correspondence, regardless of a reported pass:
- original Vibe proof artifact cryptographically authenticated;
- actual invocation of Vibe verifier independently attested;
- cross-language PhiThon equivalence verified;
- PhiThon executed or its output independently observed;
- SPV model selection, routing, ledger authority or training promotion approved.

For real cross-language behavioral verification, the next step is separately reviewed **explicit test vectors**, fixed inputs/outputs and Vibe preservation obligations, plus reproducible PhiThon execution receipts linked to those tests. A source-hash match alone is not a behavior match.

**Ledger above ego: reported outcomes are not automatically verified facts.**

# Φ PhiThon

**The Language of the Field.** An original, MIT-licensed, Python-inspired programming language with an in-browser playground and Node.js command-line runner.

> **Status: R15 experimental.** PhiThon is not Python, not a fork of CPython, and does not execute .py files. Its syntax currently uses braces. The repo contains a real tokenizer, Pratt parser, AST and interpreter.

## R15: Offline Ed25519 custody signatures for original Vibe proofs

PhiThon now supports **explicit local signing** and **out-of-band public-key verification** of the original Vibe `.vibe.proof.json` and the exact `.vibe` source bytes. It cross-checks original proof v1 against Vibe's Phase 8.4 compact brief before signing or verifying, and stores only signed source/proof hashes plus a public-key fingerprint.

```sh
npm run phi -- vibe-custody-sign original.vibe.proof.json proof-brief.json contract.vibe private.pem --out custody.json --confirm-sign
npm run phi -- vibe-custody-check custody.json original.vibe.proof.json proof-brief.json contract.vibe public.pem
```

Private key handling stays local and signing never happens automatically. A valid Ed25519 signature verifies **custody of supplied bytes by a key**, not that Vibe ran, that the signer is trusted or that PhiThon implements the entire intent. [R15 custody guide and key-handling warnings](docs/VIBE-CUSTODY.md).

## R14: Full Vibe v1 proof obligation inventory

R13's brief-only association was capped at ten Vibe obligations. PhiThon now reads the **actual original Vibe `.vibe.proof.json` v1** (the versioned artifact emitted by Vibe `verify-proof`), validates the complete `obligations` array against the Phase 8.4 brief's count and first-ten projection, and allows evidence associations for **all included obligations**.

```sh
npm run phi -- vibe-full-obligations full.vibe.proof.json proof-brief.json correspondence.json link.json intent-brief.json contract.vibe implementation.phi behavior-report.json property-report.json bindings.json --out complete-ledger.json
```

Full inventory does **not** imply authenticated proof or complete semantic coverage. It remains an operator-selected source report. Privacy-sensitive descriptions/paths are never copied into the output. [R14 original-proof guide](docs/VIBE-FULL-PROOF.md).

## R13: Sampled Vibe obligation-to-evidence ledger

The PhiVibe bridge can now **cross-reference individual Vibe proof-brief obligation IDs** with human-selected R11 behavior observations and R12 property observations. It rechecks the actual R9/R10 source correspondence, matches report source hashes and case IDs, and clearly distinguishes **Vibe-reported status**, **associated sample outcomes**, and **obligations that have no chosen evidence**.

```sh
npm run phi -- vibe-obligations proof-brief.json correspondence.json link.json intent-brief.json contract.vibe implementation.phi behavior-report.json property-report.json bindings.json --out evidence-ledger.json
```

Vibe's Phase 8.4 proof brief exports **at most 10 sampled obligations**, not a full ledger. R13 explicitly counts omitted obligations and never treats sample matches as independently authenticated or complete preservation proof. See the [obligation-evidence guide](docs/VIBE-OBLIGATIONS.md).

## R12: Deterministic property sampling for PhiVibe

PhiVibe now supports **reviewed numeric properties** across finite, reproducibly generated samples. The CLI validates the original `.vibe`/`.phi`/PhiPack source link, chooses up to 12 bounded integer inputs using a fixed 32-bit seed (including domain edges), and runs each input in a fresh PhiShield child with **no model/network authorization**.

Supported operator-declared checks: `affine`, `nonnegative`, `monotonic_nondecreasing` and `repeatable` (two independent child executions per sample). The report stores result/status/source SHA-256 digests and never claims that sample matches prove universal properties or full Vibe-to-PhiThon equivalence.

```sh
npm run phi -- vibe-properties source-link.json intent-brief.json examples/vibe-behavior/contract.vibe examples/vibe-behavior/implementation.phi examples/vibe-behavior/properties.json --out property-report.json
```

See [R12 finite property guide](docs/VIBE-PROPERTIES.md) and [the included operator-authored plan](examples/vibe-behavior/properties.json).

## R11: Reviewed behavior vectors with real PhiShield execution

PhiThon can now test **selected, human-authored behavior examples** against the same `.vibe` intent and `.phi` source linked by R9. The CLI validates the source hash link first, then runs each vector in a separate bounded PhiShield child with **no AI/model permissions**.

```sh
npm run phi -- vibe-behavior source-link.json intent-brief.json examples/vibe-behavior/contract.vibe examples/vibe-behavior/implementation.phi examples/vibe-behavior/vectors.json --out behavior-report.json
```

The report distinguishes exact single-output **MATCH**, **MISMATCH** and **ERROR**, with digests rather than raw input/output values. All selected cases must match for a zero exit code. **This is not full Vibe-to-PhiThon equivalence**, independent attestation or an exhaustive Vibe preservation proof. [Full R11 workflow, constraints and threat model](docs/VIBE-BEHAVIOR.md).

## R10: Source-bound Vibe proof-report correspondence

PhiThon can now inspect Vibe's real Phase 8.4 `proof-brief` JSON, which summarizes Vibe's own verification results. A separate, optional correspondence record revalidates the R9 `.vibe`/`.phi` source link and confirms the imported proof report **claims the same Vibe source hash**.

```sh
# Generate the proof brief separately using the Vibe compiler first.
npm run phi -- vibe-proof-inspect proof-brief.json
npm run phi -- vibe-proof-link vibe-phi-link.json proof-brief.json intent-brief.json contract.vibe implementation.phi --out correspondence.json
npm run phi -- vibe-proof-link-check correspondence.json vibe-phi-link.json proof-brief.json intent-brief.json contract.vibe implementation.phi
```

**Reported PASS is not independent verification.** No `.phi` program runs during reconciliation, the original Vibe proof artifact is not cryptographically authenticated, and semantic equivalence is **not** established. The browser has a separate local proof-brief inspector with explicit self-reported labels. [Full Phase 8.4 R10 contract and security limitations](docs/VIBE-BRIDGE.md).

## R9: PhiVibe source-hash intent bridge

Vibe is an independent intent-first compiler. PhiThon is an independent executable language. Vibe also has a guided Python layer called *PhiPython*; the names are similar but the systems are **not interchangeable**.

R9 adds support for Vibe's actual **Phase 8.4 `intent-brief` JSON contract**. Import a Vibe intent brief into the browser for an offline, read-only summary, or create a **hash-bound declared implementation link** from a Vibe specification to a PhiThon program and its optional local libraries.

```sh
# Generate intent-brief.json using the separate Vibe `vibec` CLI first.
npm run phi -- vibe-inspect intent-brief.json
npm run phi -- vibe-link intent-brief.json examples/vibe-contract/hello.vibe examples/vibe-contract/hello.phi --out vibe-phi-link.json
npm run phi -- vibe-link-check vibe-phi-link.json intent-brief.json examples/vibe-contract/hello.vibe examples/vibe-contract/hello.phi
```

**This is not translation or semantic equivalence verification.** The link checks source hashes and PhiThon syntax/dependencies, and explicitly records that no Vibe verification or PhiThon execution occurred. It grants no authority. See [PhiVibe R9 integration and limitations](docs/VIBE-BRIDGE.md) and the [example source pair](examples/vibe-contract/).

## R8: ΦBridge / real SPV offline Evidence Bench compatibility

PhiThon now understands an **actual documented SuperPhiVessel export**: the redacted `superphivessel.local-console.evidence-bench.bundle.v0.1` from SPV's Portable Windows Local Console. A strict, portable validator checks exact privacy/governance fields, model/output-hash review matching, and source evidence limits **without ever running or routing a model**.

```sh
npm run phi -- spv-bench-inspect examples/spv-evidence-bench.SYNTHETIC.json
npm run phi -- spv-bench-inspect path/to/vessie-local-evidence-bench-portable.json
```

An explicit `--models` flag reveals imported model labels in the local CLI; otherwise they're redacted. The browser has a user-selected **ΦBRIDGE / SPV EVIDENCE** file importer that reports bounded, unauthenticated statistics entirely in memory. The importer grants **no** PhiBrain permissions and provides **no** live SPV API or networking.

See the [SPV Evidence Bridge guide](docs/SPV-BRIDGE.md) for the exact upstream schema, privacy considerations and governance limitations.

## R7: Explicit local Ollama dispatch

PhiBrain can now send a **single selected `local` handoff request** to an Ollama server on your own computer. The CLI requires a separate `--confirm-local`, an exact model, request ID and fresh response-journal filename before making any network request. The endpoint is hardwired to `127.0.0.1:11434/api/generate`, with 25-second timeout, response-size caps, no redirects, proxies, DNS, remote fallback or automatic model downloads.

```sh
npm run phi -- --brain-out handoff.json examples/brain-local.phi
# Review handoff.json, confirm your local model exists, then:
npm run phi -- dispatch-local handoff.json --model gemma3:12b --request 1 --out reply.json --confirm-local
```

The output records either a response from the local server or an **uncertain attempt outcome**. Model-generated text is **unverified** and never automatically executed. Browser use remains export-only; SPV and `manual` routes cannot dispatch through this adapter. See [PhiBrain local Ollama bridge and threat model](docs/PHIBRAIN-OLLAMA.md).

## R6: Permission-controlled PhiBrain request handoff

`use brain` adds `brain_request(route, prompt)`, but staging is **denied by default**. A host must explicitly grant `brain.requests` for an individual run. Requests are limited to five prompts (2,048 characters each) and must use the intent labels `manual`, `local`, or `spv`.

```sh
npm run phi -- --brain-out requests.json examples/brain.phi
```

The CLI flag grants request staging for that run and writes a JSON envelope marked **NOT_SENT**. In the playground, the per-run checkbox enables staging, and a separate click exports a file. **R6 staged requests only:** no network, model access, token, endpoint, or implicit dispatch is included in this mode. R7 separately adds an opt-in local Ollama CLI consumer. Staged prompts are logged as `SIMULATED` events that can be SHA-256-bound into receipts. See [PhiBrain protocol, privacy and security](docs/PHIBRAIN.md).

## R5: Source-complete PhiLedger v2 receipts

PhiPack programs now get `phithon.execution-receipt.v2` JSON receipts. Every declared local library's exact source is embedded and SHA-256-hashed, alongside the main program, output, events and execution transcript. The event chain's genesis binds a canonical **module set hash**. Existing standalone v1 receipts still verify without conversion.

```sh
npm run phi -- --receipt examples/packages/main.phi
npm run phi -- verify examples/packages/main.phi.receipt.json
npm run phi -- verify-project examples/packages/main.phi.receipt.json examples/packages/main.phi
```

`verify` hashes the saved historical snapshot only. `verify-project` also compares that snapshot with the **current** main and module files on disk, so changing a local library becomes visible. Neither command executes code from a receipt.

**No authentication claim:** a new fabricated receipt can be rehashed and pass integrity verification. v2 binds bytes, not authorship, execution or a trusted clock. See [PhiLedger's v1/v2 spec](docs/LEDGER.md).

## R4: PhiPack local modules

Reusable `.phi` libraries are now first-class. Declare `export fn name(...)` or `export let name = ...` in a module, then `import moduleName` in your program. Exports appear as `moduleName_name`, preserving private lexical scopes and supporting transitive imports.

Node CLI files load modules from a local `phithon.pack.json` adjacent to the main `.phi`. Its module entries are explicitly named, restricted to regular files in the same directory and **never downloaded**. `check` parses the full module graph without running the code. The browser playground includes a Library Workshop for editing modules and saving individual source files and the manifest.

```sh
npm run phi -- examples/packages/main.phi
npm run phi -- check examples/packages/main.phi
```

**Receipts:** R4 originally blocked module-containing receipts to avoid incomplete hashes. R5 now emits complete v2 module-bound receipts while still verifying historical v1 receipts.

See the [PhiPack R4 reference](docs/PHIPACK.md).

## R3: PhiShield CLI process boundaries

Running `.phi` files from the Node CLI now uses a **short-lived child process** with a 2.5-second wall-clock deadline, output bounds, a small V8 old-space budget and a minimal inherited environment. This protects the CLI's main process from many accidental hangs. **It is not a hardened security sandbox.**

Check a PhiThon file's syntax *without executing it*:

```sh
npm run phi -- check examples/modules.phi
```

Execution, `--receipt`, and the one-line REPL also use the bounded child process. Verifying a receipt still hashes JSON only and does not execute the source inside it. See the [PhiShield policy](docs/PHISHIELD.md).

## R2: Portable PhiLedger integrity receipts

PhiThon R2 creates SHA-256 chain receipts covering the program source, output, step count and SIMULATED ledger events. Browser controls export receipts and verify JSON imported from elsewhere.

Command line:

```sh
npm run phi -- --receipt examples/modules.phi
npm run phi -- verify examples/modules.phi.receipt.json
```

**An internally valid SHA-256 hash is not proof of authorship or execution.** A different fabricated receipt can also verify. See [PhiLedger R2 protocol](docs/LEDGER.md).

## R1: Optional modules and a cancellable playground

The browser playground now runs PhiThon programs inside a dedicated **Web Worker**, with a cancel button and a hard wall-clock deadline. A Worker prevents the interpreter from freezing the editor and can be terminated. It is **not** a hardened security sandbox. The Node CLI now uses a separate, deadline-limited child, but still needs true OS-level sandboxing before running untrusted programs.

Import functionality explicitly with `use math` or `use nbg`. Modules are scoped, opt-in, and provide no shell, network or filesystem access. For example:

```phi
use math
let values = [3, 6, 9]
print("Mean:", math_mean(values))
print("Hypotenuse:", math_distance(0, 0, 3, 4))

use nbg
print("Toy cycle edges:", nbg_cycle(6))
```

**NBG note:** `nbg_cycle` and `nbg_neighbors` are *illustrative simple-cycle graph helpers* and are not implementations, simulations, verification or evidence of the NBG research closure model. [More syntax details](docs/LANGUAGE.md).

## Launch

GitHub Pages (once Settings → Pages → Build and deployment → Source: GitHub Actions is enabled):
https://michaelwave369.github.io/Phithon/

To use locally, install Node.js 20+:

```sh
npm install
npm run dev
npm test
npm run build
npm run phi -- examples/hello.phi
```

Running `npm run phi` without a filename starts a stateless one-line REPL.

## Your first PhiThon program

```phi
let who = "Field"
print("Hello, " + who)

fn square(n) {
  return n * n
}
print(square(9))

let i = 0
while (i < 5) {
  print("fib(" + i + ") =", fib(i))
  i = i + 1
}
ledger("R0_DEMO", "complete")
```

The same interpreter runs in both browser and CLI. See the [language reference](docs/LANGUAGE.md) and [examples](examples/).

## Shipped in R0 through R15

- Lexer, parser and scoped interpreter with variables, arithmetic, arrays, functions, recursion, conditions and while loops
- Builtins: `print`, `len`, `type`, `range`, `fib`, `phi`, and `ledger`
- React playground, console, simulated ledger, examples and downloadable .phi source
- Node.js CLI with examples and Node built-in test suite
- Source/token/step/output/call-depth limits
- R1 opt-in numeric and toy graph modules (`use math`, `use nbg`)
- R1 browser Worker with deadline and cancellation
- R2 SHA-256 chained JSON receipts with import/export validation
- R3 fixed-command child runner with deadline, bounded pipes, and nonexecuting syntax checking
- R4 local import/export modules, manifest loader, circular dependency checks, and browser library editor
- R5 module-complete SHA-256 receipts, legacy verification and current-project comparison
- R6 explicit per-run PhiBrain permission and manual NOT_SENT request export (no AI dispatch)
- R7 CLI-only explicitly confirmed local Ollama dispatch (one selected request; no SPV integration)
- R8 strict, read-only SPV portable Evidence Bench v0.1 import with provenance-safe summaries
- R9 Vibe Phase 8.4 intent brief import and hash-bound declared PhiThon implementation links
- R10 separately imported Vibe proof-brief self-reports, hash-correspondence and no automatic authority promotion
- R11 selected behavioral test vectors executed in bounded PhiShield children with tamper-detecting SHA-256 result records

**Security boundary:** PhiThon cannot directly access JavaScript host globals, a shell, disk, or network. Nevertheless this is **not a hardened sandbox**. The browser runtime runs in a killable dedicated Web Worker with a wall-clock timeout. Run only trusted code. `ledger` events are **SIMULATED and in memory**, not cryptographically signed, immutable or persisted.

## Architecture

```text
.phi source
    │
 tokenizer → tokens
    │
 Pratt parser → AST
    │
 interpreter → output + simulated ledger
     ├── React browser playground
     └── Node CLI
```

## Next milestones (not implemented)

R16: independent key-trust registries and replayable Vibe verifier evidence only with pinned toolchains; stronger OS-level isolation and carefully scoped protocols.
Future: explicit capability enforcement, audited adapters and authenticated signed receipts.
Later: reviewed adapters for SPV, NBG and WhiteHatLedger369.

The core language will never silently grant file, shell, or network access. The CLI child process still inherits the host's OS identity and is **not** safe for hostile programs.

## License

MIT © 2026 MichaelWave369. Ledger above ego.

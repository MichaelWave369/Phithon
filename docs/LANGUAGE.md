# PhiThon R1 Language Reference

**PhiThon is a newly implemented language, not a Python interpreter or Python fork.**
The syntax below is intentional and currently uses braces, not indentation blocks.

## Statements

```phi
# single line comment
let name = "Field"
let n = 2
n = n + 1

fn double(x) { return x * 2 }
print(double(n))

if (n > 2) {
  print("yes")
} else {
  print("no")
}

while (n > 0) {
  n = n - 1
}
```

- A variable must be declared with `let` before assignment.
- `fn` declares a named function; functions capture the surrounding lexical scope.
- `return expression` works only inside a function.
- `if`, `else` and `while` use parentheses and braced blocks.
- Newlines or optional semicolons usually separate statements. For ambiguous multi-line expressions, use semicolons.
- Values: numbers, text (single or double quotes), `true`, `false`, `null`, arrays (e.g. `[1,2,3]`).
- Read arrays and text using zero-based indexing, e.g. `a[0]`. Negative indexes are not yet supported.
- Operators: `+`, `-`, `*`, `/`, `%`, `!`, `==`, `!=`, `<`, `<=`, `>`, `>=`, `&&`, `||`.
- `&&` and `||` short circuit. Addition concatenates text when either operand is text.
- Arrays cannot currently be mutated, appended, or sliced.

## Built-ins

| Name | Behavior |
| --- | --- |
| `print(...values)` | Append text to program console |
| `len(x)` | Length of array or text |
| `type(x)` | Type label |
| `phi()` | Golden ratio approximation |
| `fib(n)` | Fibonacci number for integer 0..78 |
| `range(n)` | Array of integers 0..n-1 (max 1000) |
| `ledger(event, value)` | In-memory demo event with SIMULATED provenance |

`ledger()` events are in-memory and SIMULATED. Separately, CLI and browser can generate real SHA-256 integrity receipts for execution transcripts, including R5 module sources. These receipts are not signed and cannot authenticate a run.

## Execution and safety

The PhiThon interpreter does **not** expose JavaScript `eval`, arbitrary module loading, host objects, filesystem APIs, shell commands or networking to PhiThon programs. It has a small built-in allowlist of opt-in modules. The interpreter implements source, token, step, recursion, output and selected size limits. The browser uses a killable Web Worker with a wall-clock deadline; the CLI does not yet have process isolation. Neither mode is a hardened boundary for untrusted hostile programs.

## Command line

```sh
npm install
npm run phi -- examples/hello.phi
npm run phi
```

The R3 CLI REPL reads a single line per program and does **not** preserve variable state across lines.

## Planned, NOT implemented

- Indentation-based Python-like syntax, rich modules and package manager
- Type checking and tooling
- OS-level privilege confinement for CLI subprocesses
- Capability-granted external adapters
- Versioned, signed Ledger integration, SPV AI adapters and research-grade NBG implementation
- Compatibility tooling for Python


## R1: Opt-in modules

Use the keyword `use` to import a module into the current lexical scope (not the global environment).
Builtins are prefixed to prevent confusion with regular PhiThon functions:

```phi
use math
let values = [3, 6, 9]
print(math_mean(values))        # 6
print(math_sum(values))         # 18
print(math_distance(0,0,3,4))  # 5
print(math_clamp(1.6, 0, 1))    # 1
```

Use one import per lexical scope. Re-importing the same module in the same scope is an error, and there is no arbitrary file loading or dynamic plugin execution.

### Math module

| Builtin | Description |
| --- | --- |
| `math_abs(x)` | Absolute value |
| `math_sqrt(x)` | Square root, x must be nonnegative |
| `math_pow(base, exponent)` | Finite exponentiation |
| `math_sin(x)` / `math_cos(x)` | Radian trigonometry |
| `math_pi()` / `math_tau()` | Pi and two times pi |
| `math_clamp(value, low, high)` | Clamp to ordered bounds |
| `math_sum(array)` | Bounded numeric array sum |
| `math_mean(array)` | Mean of nonempty bounded numeric array |
| `math_distance(x1,y1,x2,y2)` | Euclidean 2D distance |

Arrays for math_sum/math_mean are limited to 1000 numeric elements. Non-finite results are rejected.

### NBG module: educational graph toys only

```phi
use nbg
print(nbg_cycle(4))         # [[0,1], [1,2], [2,3], [3,0]]
print(nbg_neighbors(6, 0)) # [5,1]
```

`nbg_cycle(n)` computes edges of the undirected simple cycle graph C_n.
`nbg_neighbors(n, i)` returns the two neighbors of vertex i in C_n.
Allowed n = 3..64. **These are intentionally limited elementary graph examples. They do not model, implement, validate or prove any claims in the Nested Bubble/Gear research program.**

### R1 browser execution

The playground runs each program inside a disposable browser Web Worker, with a 2.5 second wall-clock deadline and an interactive Stop button. The synchronous interpreter still enforces step and recursion limits. R3 adds a parent-enforced CLI child-process wall-clock deadline. Neither the Worker nor the language is a security sandbox for untrusted adversarial code. Ledger events remain **SIMULATED**, ephemeral and unsigned.


## R3 CLI and PhiShield

The CLI executes programs in a separate Node child with a fixed 2.5-second parent-enforced deadline. Use `npm run phi -- check path/to/program.phi` to tokenize and parse without executing statements. `verify` on receipt JSON remains hash-only and never runs imported source. This improves accidental-failure containment but **does not create an OS security sandbox or separate user privileges**. See [PhiShield](PHISHIELD.md).

## R4: Local packages

Use `import numbers` to load explicitly registered `.phi` module source. A module may declare `export fn double(x) { return x*2 }`, or `export let multiplier=3`. Call the exported names as `numbers_double(4)` or reference `numbers_multiplier`. Exported functions retain access to private module bindings and imported dependencies.

The CLI reads a local `phithon.pack.json` adjacent to the entry program, which maps names to same-directory `.phi` files. In-browser files come from the editable Library Workshop. Imports are lexical, checked for cycles and missing dependencies, and do not make filesystem or network APIs available inside PhiThon.

R4 originally blocked incomplete package receipts. R5 now enables versioned v2 source-complete module receipts. Refer to [PhiPack](PHIPACK.md) and [PhiLedger](LEDGER.md) for the format, checks and security limitations.

## R5: Module receipts

`--receipt` chooses the v2 schema for packages with local modules and v1 for standalone programs. `verify` checks both formats without running code. `verify-project` additionally compares the receipt's source snapshot with current `.phi` source and local package files. SHA-256 checksums cannot prove who created the receipt, when it was produced, or whether the program truly executed.

## R6: Permission-gated PhiBrain

`use brain` exposes `brain_request(route, prompt)`, which only stages inert request data and records a SIMULATED ledger event. Host permission `brainGrant: true` is required separately on **each execution**. Routes are the strings `manual`, `local`, or `spv` (intent labels, not network destinations). Five requests and 2,048 characters per prompt are the R6 maxima. The CLI flag `--brain-out <file.json> <file.phi>` explicitly grants staging and saves a NOT_SENT file; the browser uses a per-run consent checkbox and manual JSON export. **Neither connects to AI models or SPV.** See [PhiBrain](PHIBRAIN.md).

## R7: Optional local Ollama dispatch

PhiThon language programs still cannot call models themselves. On Node CLI only, a separately authorized `dispatch-local` command can consume a previously staged `NOT_SENT` handoff of route `local` and send exactly one selected prompt to the fixed loopback Ollama endpoint. It requires the exact `--confirm-local` flag and creates an exclusive response journal before dispatch. The returned model text is unverified data, not executable code or proof of identity. Neither the browser nor `spv`-routed requests can use this dispatch adapter. See [PhiBrain Ollama bridge](PHIBRAIN-OLLAMA.md).

## R8: SPV Evidence Bench bridge

The Node CLI `spv-bench-inspect <portable.json>` validates a manually selected, redacted SuperPhiVessel Portable Evidence Bench v0.1 JSON export. It prints provenance-limited descriptive counts and chronological performance observations, masking model names by default. The browser playground has a matching local file inspector. This **does not** grant model execution, change PhiBrain permissions, contact SPV, or promote claims to independently verified evidence. See [SPV Bridge](SPV-BRIDGE.md).

## R9: Vibe intent bridge

Vibe is a distinct intent-first compiler, not PhiThon or Vibe's own PhiPython guided Python layer. The CLI `vibe-inspect` validates Vibe's Phase 8.4 `intent-brief` JSON and reports declared intent only. `vibe-link <brief.json> <contract.vibe> <program.phi> --out <link.json>` checks the *actual Vibe source's* SHA-256 against the claimed brief, parses PhiThon and local module dependencies, then records source SHA-256 hashes and `HUMAN_DECLARED_IMPLEMENTATION` with all verification/authority flags set false. `vibe-link-check` detects source drift relative to the saved link. The browser has a read-only Phase 8.4 intent importer; neither Vibe verification, PhiThon execution nor semantic equivalence is performed. See [PhiVibe](VIBE-BRIDGE.md).

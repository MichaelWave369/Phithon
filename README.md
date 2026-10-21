# Φ PhiThon

**The Language of the Field.** An original, MIT-licensed, Python-inspired programming language with an in-browser playground and Node.js command-line runner.

> **Status: R2 experimental.** PhiThon is not Python, not a fork of CPython, and does not execute .py files. Its syntax currently uses braces. The repo contains a real tokenizer, Pratt parser, AST and interpreter.

## R2: Portable PhiLedger integrity receipts

PhiThon R2 creates SHA-256 chain receipts covering the program source, output, step count and SIMULATED ledger events. Browser controls export receipts and verify JSON imported from elsewhere.

Command line:

```sh
npm run phi -- --receipt examples/modules.phi
npm run phi -- verify examples/modules.phi.receipt.json
```

**An internally valid SHA-256 hash is not proof of authorship or execution.** A different fabricated receipt can also verify. See [PhiLedger R2 protocol](docs/LEDGER.md).

## R1: Optional modules and a cancellable playground

The browser playground now runs PhiThon programs inside a dedicated **Web Worker**, with a cancel button and a hard wall-clock deadline. A Worker prevents the interpreter from freezing the editor and can be terminated. It is **not** a hardened security sandbox. The Node CLI still runs synchronously and needs process isolation before running untrusted programs.

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

## Shipped in R0, R1 and R2

- Lexer, parser and scoped interpreter with variables, arithmetic, arrays, functions, recursion, conditions and while loops
- Builtins: `print`, `len`, `type`, `range`, `fib`, `phi`, and `ledger`
- React playground, console, simulated ledger, examples and downloadable .phi source
- Node.js CLI with examples and Node built-in test suite
- Source/token/step/output/call-depth limits
- R1 opt-in numeric and toy graph modules (`use math`, `use nbg`)
- R1 browser Worker with deadline and cancellation
- R2 SHA-256 chained JSON receipts with import/export validation

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

R3: stronger syntax, package tools, richer library and isolated CLI processes.
Future: explicit capability enforcement, audited adapters and authenticated signed receipts.
Later: reviewed adapters for SPV, NBG and WhiteHatLedger369.

The core language will never silently grant file, shell, or network access.

## License

MIT © 2026 MichaelWave369. Ledger above ego.

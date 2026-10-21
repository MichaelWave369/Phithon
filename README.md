# Φ PhiThon

**The Language of the Field.** An original, MIT-licensed, Python-inspired programming language with an in-browser playground and Node.js command-line runner.

> **Status: R0 experimental.** PhiThon is not Python, not a fork of CPython, and does not execute .py files. Its syntax currently uses braces. The repo contains a real tokenizer, Pratt parser, AST and interpreter.

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

## Shipped in R0

- Lexer, parser and scoped interpreter with variables, arithmetic, arrays, functions, recursion, conditions and while loops
- Builtins: `print`, `len`, `type`, `range`, `fib`, `phi`, and `ledger`
- React playground, console, simulated ledger, examples and downloadable .phi source
- Node.js CLI with examples and Node built-in test suite
- Source/token/step/output/call-depth limits

**Security boundary:** PhiThon cannot directly access JavaScript host globals, a shell, disk, or network. Nevertheless this is **not a hardened sandbox**. The browser runtime runs synchronously on the main thread. Run only trusted code. `ledger` events are **SIMULATED and in memory**, not cryptographically signed, immutable or persisted.

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

R1: stronger syntax, modules, package tools, richer library.
R2: isolated worker/process runner, explicit capability enforcement and auditing.
R3: reviewed adapters for SPV, NBG and WhiteHatLedger369, plus real versioned ledger receipts.

The core language will never silently grant file, shell, or network access.

## License

MIT © 2026 MichaelWave369. Ledger above ego.

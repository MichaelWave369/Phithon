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

`ledger` is not cryptographically signed, persisted, or tamper-evident. Real verifiable receipts are future work.

## Execution and safety

The R0 interpreter deliberately does **not** expose `eval`, imports, host objects, filesystem APIs, shell commands, or networking to PhiThon programs. It includes source, token, step, recursion, output, and some value-size limits. This makes it useful for experiments and teaching but **not** a hardened security boundary for arbitrary hostile input. The browser demo runs on the main thread, not in a sandboxed process or Worker. Run only code you trust until isolation is implemented and audited.

## Command line

```sh
npm install
npm run phi -- examples/hello.phi
npm run phi
```

The R0 REPL reads a single line per program and does **not** preserve variable state across lines.

## Planned, NOT implemented

- Indentation-based Python-like syntax and richer standard library
- Type checker, modules, imports and packaging
- Web Worker and/or isolated subprocess execution
- Capability grants for selected adapters
- Versioned, signed Ledger integration, SPV AI adapters, NBG modules
- Compatibility tooling for Python, rather than claiming Python syntax support


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

The playground runs each program inside a disposable browser Web Worker, with a 2.5 second wall-clock deadline and an interactive Stop button. The synchronous interpreter and Node CLI still enforce step and recursion limits, but the Node CLI has no wall-clock kill mechanism. Neither the Worker nor the language is a security sandbox for untrusted adversarial code. Ledger events remain **SIMULATED**, ephemeral and unsigned.


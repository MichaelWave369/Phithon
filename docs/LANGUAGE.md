# PhiThon R0 Language Reference

**PhiThon is a newly implemented language, not a Python interpreter or Python fork.**
The syntax below is intentional and currently uses braces, not indentation blocks.

## Statements

\`\`\`phi
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
\`\`\`

- A variable must be declared with \`let\` before assignment.
- \`fn\` declares a named function; functions capture the surrounding lexical scope.
- \`return expression\` works only inside a function.
- \`if\`, \`else\` and \`while\` use parentheses and braced blocks.
- Newlines or optional semicolons usually separate statements. For ambiguous multi-line expressions, use semicolons.
- Values: numbers, text (single or double quotes), \`true\`, \`false\`, \`null\`, arrays (e.g. \`[1,2,3]\`).
- Read arrays and text using zero-based indexing, e.g. \`a[0]\`. Negative indexes are not yet supported.
- Operators: \`+\`, \`-\`, \`*\`, \`/\`, \`%\`, \`!\`, \`==\`, \`!=\`, \`<\`, \`<=\`, \`>\`, \`>=\`, \`&&\`, \`||\`.
- \`&&\` and \`||\` short circuit. Addition concatenates text when either operand is text.
- Arrays cannot currently be mutated, appended, or sliced.

## Built-ins

| Name | Behavior |
| --- | --- |
| \`print(...values)\` | Append text to program console |
| \`len(x)\` | Length of array or text |
| \`type(x)\` | Type label |
| \`phi()\` | Golden ratio approximation |
| \`fib(n)\` | Fibonacci number for integer 0..78 |
| \`range(n)\` | Array of integers 0..n-1 (max 1000) |
| \`ledger(event, value)\` | In-memory demo event with SIMULATED provenance |

\`ledger\` is not cryptographically signed, persisted, or tamper-evident. Real verifiable receipts are future work.

## Execution and safety

The R0 interpreter deliberately does **not** expose \`eval\`, imports, host objects, filesystem APIs, shell commands, or networking to PhiThon programs. It includes source, token, step, recursion, output, and some value-size limits. This makes it useful for experiments and teaching but **not** a hardened security boundary for arbitrary hostile input. The browser demo runs on the main thread, not in a sandboxed process or Worker. Run only code you trust until isolation is implemented and audited.

## Command line

\`\`\`sh
npm install
npm run phi -- examples/hello.phi
npm run phi
\`\`\`

The R0 REPL reads a single line per program and does **not** preserve variable state across lines.

## Planned, NOT implemented

- Indentation-based Python-like syntax and richer standard library
- Type checker, modules, imports and packaging
- Web Worker and/or isolated subprocess execution
- Capability grants for selected adapters
- Versioned, signed Ledger integration, SPV AI adapters, NBG modules
- Compatibility tooling for Python, rather than claiming Python syntax support

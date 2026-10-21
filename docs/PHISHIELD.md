# PhiShield R3: bounded CLI execution and syntax inspection

PhiThon now runs .phi source files in a fresh, disposable **Node.js child process** by default instead of executing them in the long-lived CLI process.

## Usage

```bash
npm run phi -- examples/hello.phi
npm run phi -- check examples/modules.phi
npm run phi -- --receipt examples/modules.phi
npm run phi -- verify examples/modules.phi.receipt.json
```

- **Execute**: child process loads the language interpreter and returns only structured output, result, step count and in-memory SIMULATED ledger events.
- **Check**: child process tokenizes and parses the entire program; reports statement and token counts, without executing PhiThon statements.
- **Receipt**: executes in the bounded child, then the parent produces the R2 SHA-256 integrity envelope; no overwrite of existing receipts.
- **Verify**: reads JSON and verifies claimed SHA-256 integrity only; DOES NOT execute source from a receipt.
- **REPL**: each input line executes separately in its own child. Variables do not persist between lines.

## Runtime controls

| Control | R3 implementation |
| --- | --- |
| Program source | 100,000 JavaScript UTF-16 code units and 400,000 UTF-8 bytes max |
| Input protocol | JSON over child stdin, with 900 KB input cap |
| Process command | Fixed Node executable, fixed child script; shell disabled |
| Execution deadline | 2,500 ms per child, enforced by parent; terminating child on timeout |
| Child V8 heap | Node `--max-old-space-size=96` (approximately 96 MiB old-space cap, **not** a total process memory quota) |
| Stdout/stderr protocol | Structured response, bounded to 1 MB stdout and 32 KiB stderr |
| Environment | Minimal child environment; SystemRoot retained on Windows when needed |
| Interpreter limits | Existing PhiThon parser/source, 30,000 step, recursion, output/array limits |
| Syntax-only check | Interpreter parser/lexer; no program execution |

## Explicit non-goals and threats

**PhiShield R3 is NOT a strong sandbox.** A Node child process inherits the operating-system user identity and filesystem/network permissions even if the PhiThon language itself does not expose those APIs. A VM escape, parser bug or other interpreter vulnerability could still affect the host. We do not claim privilege separation, OS seccomp, containers, chroot, process-level address-space limits, filesystem permission revocation, or authenticated execution. The V8 heap limit is not a total RSS cap; process termination and IPC limits are availability protections, not comprehensive defenses against adversarial code.

For untrusted code, future releases need explicitly restricted OS identities, platform-specific sandboxing, capped filesystem/network access and security reviews.

This change does *not* authorize any new PhiThon import, shell command, filesystem or network facility.

## CI

`tests/phishield-cli.test.js` checks subprocess execution, Unicode, syntax checks, propagation of errors, CLI compatibility, rejection of unsupported modes, and deadline enforcement. The prior CLI receipt integration tests still cover R2 output and verification after the runtime moves to a child process.

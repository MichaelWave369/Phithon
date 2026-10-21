# PhiLedger R2: SHA-256 integrity receipts

PhiLedger R2 produces a **portable, self-consistent SHA-256 record** of a PhiThon program, its output, its execution step count, and its simulated ledger events. It can be checked independently of the originating browser tab.

**What this does NOT prove:** who ran the program, when it ran, whether it truly ran, whether the output was honestly generated, or whether the entire document was replaced with a newly re-hashed forgery. **Hashes are not signatures.** Trust needs a separately trusted digest or future cryptographic authentication.

## Getting started

Run a program in the [PhiThon playground](https://michaelwave369.github.io/Phithon/), then choose **Export receipt** to download JSON. Choose **Verify JSON** to import and check a receipt. Importing JSON does **not** execute its PhiThon source.

From the CLI, Node.js 20+ with WebCrypto:

```sh
npm run phi -- --receipt examples/modules.phi
npm run phi -- verify examples/modules.phi.receipt.json
```

The first command fails rather than overwriting an existing receipt. The verifier returns nonzero exit status on mismatch.

## Receipt format: phithon.execution-receipt.v1

```json
{
  "schema": "phithon.execution-receipt.v1",
  "algorithm": "SHA-256",
  "createdAt": "2026-10-21T12:00:00.000Z",
  "sourceHash": "<sha256 of UTF-8 source>",
  "execution": { "output": ["Hello"], "result": "null", "steps": 4 },
  "source": "print('Hello')",
  "genesisHash": "<sha256 of canonical header>",
  "events": [
    {
      "sequence": 1,
      "event": "RUN",
      "data": "demo",
      "provenance": "SIMULATED",
      "previousHash": "<genesisHash>",
      "hash": "<sha256 of canonical event excluding hash>"
    }
  ],
  "headHash": "<last event hash, or genesisHash>",
  "receiptHash": "<sha256 of canonical document excluding receiptHash>"
}
```

Hashing rules:

- SHA-256 operates on UTF-8 text.
- Canonical JSON uses sorted object keys recursively, compact output, array order preserved.
- `sourceHash = SHA256(raw source text)`, not JSON escaped source.
- `genesisHash = SHA256(canonical({schema,algorithm,createdAt,sourceHash,execution}))`.
- Event hash is `SHA256(canonical({sequence,event,data,provenance,previousHash}))`, with the first link pointing to genesisHash.
- `headHash` is the final event hash, or genesisHash if there are no events.
- `receiptHash = SHA256(canonical(receipt excluding receiptHash))`.

Verification regenerates the same document from its claimed contents, validates bounds and exact keys, and checks all hashes. It does not independently replay or audit execution.

## Provenance and security

Original `ledger(event, value)` events remain **SIMULATED**. R2 wraps the *claimed* run transcript and events in an integrity envelope. The digests are real SHA-256; the events are not promoted to VERIFIED or OBSERVED.

`createdAt` is a user-clock timestamp, NOT a trusted timestamp. The receipt contains program source and output: avoid exporting secrets.

| Scenario | Behavior |
| --- | --- |
| A value is edited, removed or reordered without updating the hashes | Verification fails |
| Someone creates an entirely new internally consistent fake receipt | Verification can succeed; no authentication |
| Import contains hostile PhiThon source | The verifier hashes it and never executes it |
| Hostile source is run through the browser playground | NOT SAFE: a Worker is not an OS security boundary |
| Browser WebCrypto is unavailable | Receipt hashing fails clearly, execution output remains available |

Potential future work: authenticated signed receipts, independent digests, source replay, secure isolated execution and provenance identity. None is part of R2.

# PhiBrain R7: explicitly authorized local Ollama adapter

This is PhiThon's first adapter that can actually call an AI model. It is **not a live SuperPhiVessel integration**. It is an opt-in **Node CLI** handoff consumer for a separately running, locally installed Ollama server.

Ollama's documented non-streaming generate API accepts a POST to `http://127.0.0.1:11434/api/generate` with a body containing `model`, `prompt`, and `stream:false`.

R7 intentionally implements this narrow API only. **Your browser playground still never calls a model or contacts Ollama.** It only exports inert JSON.

## 1. Stage a request without dispatching anything

```sh
npm run phi -- --brain-out handoff.json examples/brain-local.phi
```

This executes the PhiThon script with a one-run `brain.requests` grant and saves `handoff.json` with `status:"NOT_SENT"`. Stage one or more requests with:

```phi
use brain
brain_request("local", "Give me three unit-test ideas.")
```

Routes `manual` and `spv` are NOT accepted by this adapter, even if the handoff file mentions them. A route is a declared intent, not authority to connect.

## 2. Inspect the JSON and your local Ollama setup

Manually review `handoff.json` for private prompts and confirm you intend to send the selected prompt to your own local Ollama instance. Install Ollama separately and ensure the named model already exists locally. R7 does not install Ollama, auto-pull models, inspect your model inventory or start a service.

## 3. Explicitly authorize one dispatch

```sh
npm run phi -- dispatch-local handoff.json --model gemma3:12b --request 1 --out reply.json --confirm-local
```

**All parts are mandatory.** The CLI requires the exact `--confirm-local` flag, an explicit model name, a numeric request ID and an output filename. It rejects unknown switches, nonexistent IDs, requests with non-`local` routes, modified/spoofed handoff schema, and malformed model names.

The CLI writes an exclusive journal file before contacting Ollama. Using the same output filename again fails rather than sending a duplicate request. It sends **one selected request** per command, never the whole queue.

### Response journal

- `INTENT_RECORDED_NOT_YET_SENT`: local journal created before the HTTP attempt.
- `RESPONSE_RECORDED`: Ollama returned a response matching the selected model and the result was saved in the journal, marked `UNVERIFIED_MODEL_OUTPUT`.
- `ATTEMPTED_OUTCOME_UNCONFIRMED`: network/timeout/invalid-response error. A timeout does **not** prove the model didn't receive the request.

The response body is **untrusted text**. PhiThon does not run it as code, instructions, shell commands or follow-up PhiThon programs. No results are silently fed into subsequent PhiThon executions.

## Security and privacy constraints

| Control | R7 behavior |
| --- | --- |
| Destination | Literal IPv4 127.0.0.1 port 11434, path /api/generate |
| HTTP method | POST, JSON, non-streaming, one selected prompt |
| Arbitrary URLs | Not supported |
| Redirects | Refused (HTTP status other than 200 is an error) |
| Proxy / DNS | No proxy adapter, no DNS, no host lookup, no remote fallback |
| Retries | None |
| Model | Explicit exact model string, validated; does not pull or discover |
| Generation | At most 128 predicted tokens requested |
| Deadline | 25 seconds for local HTTP response |
| Input | Up to 2,048 characters per prompt; at most 5 staged requests, ONE dispatched |
| HTTP response | 64 KiB total body; at most 8,192 characters of generated text |
| Output | Exclusive user-named journal (mode 0600 on POSIX) |
| SPV integration | **Not implemented**; route `spv` rejected |
| Browser direct access | **Not implemented** |
| Evidence | Operational attempt status, not a digital signature or attestation |

Although `127.0.0.1` avoids remote routing, an untrusted process on your own computer could occupy that port and impersonate Ollama. There is **no authentication** of the local service and thus no cryptographic attestation that a specific model created the text. Do not put secrets in prompts, handoff files or journals.

A journal is not an exactly-once queue: a crash, lost response or using a different journal filename may lead to duplicate dispatch. After errors, inspect Ollama manually before retrying. This adapter does **not** provide a hardened security sandbox.

### Automated test scope

R7 tests use mocked HTTP transport to validate fixed loopback routing, POST/body shape, rejection of redirects and malformed responses, permission gates, and refusal of SPV routes. **CI does not contact or require a live local Ollama server**, so actual performance and compatibility with your installed models still need testing on your PC.

Future SPV work will require a separately reviewed API contract, authentication/authorization, and independently auditable transport controls before the `spv` route can ever dispatch.

**Ledger above ego. No silent dispatch.**

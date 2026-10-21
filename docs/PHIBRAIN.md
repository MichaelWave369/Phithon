# PhiBrain R6: explicit, offline AI handoff

PhiBrain R6 introduces the **first capability-gated request protocol** for PhiThon. It does **not** connect to SuperPhiVessel, Ollama, or a model yet. It creates inspectable, inert request data that a future SPV/AI adapter could consume *after a separate, explicitly authorized dispatch step*.

## Language

```phi
use brain
let id = brain_request("spv", "Summarize these lab notes in three points.")
print("Staged request:", id)
```

The module is lexical: programs must explicitly `use brain` before referencing `brain_request`. Loading it does not confer a grant. A separate host-controlled `brainGrant === true` permission is required when execution begins. Without that permission the function throws a clear error and does not stage a request.

`brain_request(route, prompt)` accepts exactly two string arguments. Routes are one of `manual`, `local`, or `spv`. They are **intent labels, not destinations**. The prompt must be nonblank and no more than 2,048 characters. Each execution may stage up to five requests, receiving sequential numeric IDs. It returns the ID, **not a model response**.

There are no URLs, tokens, environment variables, network connections, shell commands, filesystem access, model discovery, or implicit SPV dispatch available to PhiThon source.

## CLI

```sh
npm run phi -- examples/brain.phi
# Fails: PhiBrain permission denied

npm run phi -- --brain-out requests.json examples/brain.phi
# Succeeds: saves manual handoff with NOT_SENT status
```

The `--brain-out` flag is an explicit one-run grant that both enables staging and names a local destination for the handoff file. It fails if the output already exists, if no requests are staged, or if the execution fails. Normal CLI, receipt and REPL modes **do not** receive this grant by default. PhiShield's bounded child process still executes the code.

## Browser playground

Choose **PhiBrain Bridge**, then manually check **Grant brain.requests permission for next Run only**. Each run consumes this grant, clearing the checkbox. An authorized run may show queued request count, and **Export handoff JSON** downloads the file only when the user clicks. Nothing is sent over the network, even when the route is `spv`.

## Handoff schema

```json
{
  "schema": "phithon.brain-handoff.v1",
  "status": "NOT_SENT",
  "provenance": "SIMULATED",
  "delivery": "MANUAL_EXPORT_ONLY",
  "requests": [
    { "id": 1, "route": "spv", "prompt": "Suggest 3 test cases for a module." }
  ]
}
```

This is a **proposal for a future consumer**, not a published SPV contract or an SPV integration. The receiving system must not blindly execute handoff instructions, must validate inputs and permissions independently, and must mark actual dispatch and model output with separate audit records.

## Ledger, receipts and privacy

Each staged request is also stored in PhiThon's in-memory `ledger` with event name `BRAIN_REQUEST`, the **exact JSON prompt payload** in data, and `SIMULATED` provenance. Existing v1/v2 receipt hashing therefore covers the request intent if the program is explicitly sealed. This does **not** attest actual transmission, model output, identity, or trusted time.

**Privacy:** prompts may contain sensitive data. Do not write sensitive prompts that you would not want in downloaded handoff files or ledger receipts. Requests stay inside the local program until manually exported. Be aware that sending a downloaded file to another system in the future requires separate review and consent.

**Security:** opt-in staging is not a hardened sandbox or an isolation guarantee. The Node child process is an availability boundary, not a separate OS identity. Future real model adapters must have scoped endpoint allowlists, transport authentication, independent budget/timeout controls, user-confirmed dispatch, and verified response provenance. None of those dispatch capabilities ship in R6.

Ledger above ego: permission, intention, delivery, and verification must not be conflated.

## R7 follow-on: local Ollama consumer

The R6 browser and `--brain-out` pathways remain **offline request staging**. R7 adds a **separate** Node CLI `dispatch-local` consumer requiring a fresh `--confirm-local` flag, explicit model, request ID and journal output filename before contacting only `127.0.0.1:11434`. This does not enable browser dispatch or SPV. See [R7 local Ollama adapter](PHIBRAIN-OLLAMA.md).

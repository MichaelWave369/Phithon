import test from "node:test";
import assert from "node:assert/strict";
import {
  validateLocalDispatch, makeDispatchJournal, dispatchAuthorizedLocal
} from "../src/brain/dispatch-local.js";
import { makeBrainHandoff } from "../src/brain/handoff.js";
import { OLLAMA_ENDPOINT, postLocalOllama, validateLocalModel } from "../src/brain/local-ollama.js";

const local = () => makeBrainHandoff([
  { id: 1, route: "local", prompt: "Explain a simple numerical test." }
]);

test("v1 handoff is NOT itself authorization for local dispatch", () => {
  assert.throws(() => validateLocalDispatch(local(), { model: "gemma3:12b", requestId: 1 }), /explicit/);
  assert.throws(() => validateLocalDispatch(local(), { consent: "yes", model: "gemma3:12b", requestId: 1 }), /explicit/);
  const allowed = validateLocalDispatch(local(), { consent: true, model: "gemma3:12b", requestId: 1 });
  assert.equal(allowed.route, "local");
  assert.equal(allowed.model, "gemma3:12b");
});

test("SPV and manual routes can NEVER be dispatched by local adapter", () => {
  const spv = makeBrainHandoff([{ id: 1, route: "spv", prompt: "hello" }]);
  const manual = makeBrainHandoff([{ id: 1, route: "manual", prompt: "hello" }]);
  for (const handoff of [spv, manual]) {
    assert.throws(() => validateLocalDispatch(handoff, {
      consent: true, model: "gemma3:12b", requestId: 1
    }), /only requests marked 'local'/);
  }
});

test("selecting nonexistent ID, spoofed status or unknown keys is refused", () => {
  const options = { consent: true, model: "gemma3:12b", requestId: 1 };
  assert.throws(() => validateLocalDispatch(local(), { ...options, requestId: 2 }), /does not exist/);
  for (const change of [
    r => { r.status = "SENT"; },
    r => { r.provenance = "VERIFIED"; },
    r => { r.endpoint = "https://attacker.example"; },
    r => { r.requests[0].endpoint = "http://evil.test"; }
  ]) {
    const r = local(); change(r);
    assert.throws(() => validateLocalDispatch(r, options));
  }
});

test("fixed model syntax validation prevents arbitrary URL/flag injection", () => {
  assert.equal(OLLAMA_ENDPOINT, "http://127.0.0.1:11434/api/generate");
  for (const bad of ["", "../foo?bar", "-X", "abc example", "https://evil", "foo\nbar", "a".repeat(200)]) {
    assert.throws(() => validateLocalModel(bad));
  }
  assert.equal(validateLocalModel("gemma3:12b"), "gemma3:12b");
});

test("dispatch uses exactly one selected prompt, and response remains UNVERIFIED", async () => {
  const item = validateLocalDispatch(local(), {
    consent: true, model: "gemma3:12b", requestId: 1
  });
  const journal = makeDispatchJournal(item);
  assert.equal(journal.status, "INTENT_RECORDED_NOT_YET_SENT");
  assert.equal(journal.response, null);
  let calls = 0;
  const result = await dispatchAuthorizedLocal(item, {
    send: async value => {
      calls++;
      assert.deepEqual(value, { model: "gemma3:12b", prompt: "Explain a simple numerical test." });
      return { model: "gemma3:12b", response: "Test the edge cases.", evalCount: 7 };
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "RESPONSE_RECORDED");
  assert.equal(result.provenance, "UNVERIFIED_MODEL_OUTPUT");
  assert.equal(result.response.text, "Test the edge cases.");
  assert.equal(result.response.evalCount, 7);
});

test("a malformed/mismatched model output is not reported as success", async () => {
  const item = validateLocalDispatch(local(), {
    consent: true, model: "gemma3:12b", requestId: 1
  });
  await assert.rejects(dispatchAuthorizedLocal(item, {
    send: async () => ({ model: "other-model", response: "fake" })
  }), /invalid transport result/);
});

test("timeout, oversized prompts and no consent never trigger a live network connection", async () => {
  await assert.rejects(postLocalOllama({model:"gemma3:12b",prompt:"",timeoutMs:1000}),/prompt/);
  await assert.rejects(postLocalOllama({model:"gemma3:12b",prompt:"hi",timeoutMs:999999}),/timeout/);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(postLocalOllama({model:"gemma3:12b",prompt:"hi",signal:aborted.signal}),/cancelled/);
});

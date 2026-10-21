import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { postLocalOllama } from "../src/brain/local-ollama.js";

/**
 * Fake Node http.request, no socket creation. Capture the exact route and body.
 */
function fakeTransport(statusCode, responseBody) {
  const record = { calls: 0, options: null, payload: null };
  function requestFactory(options, callback) {
    record.calls++;
    record.options = options;
    const req = new EventEmitter();
    req.destroy = (error) => queueMicrotask(() => req.emit("error", error));
    req.end = payload => {
      record.payload = JSON.parse(payload);
      queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = statusCode;
        response.resume = () => {};
        callback(response);
        if (statusCode === 200) {
          response.emit("data", Buffer.from(JSON.stringify(responseBody)));
          response.emit("end");
        }
      });
    };
    return req;
  }
  return { record, requestFactory };
}

test("local Ollama HTTP path and port are literal, only POST generate is sent", async () => {
  const mock = fakeTransport(200, {
    model: "gemma3:12b", done: true, response: "Three tests: A, B, C",
    prompt_eval_count: 14, eval_count: 9
  });
  const output = await postLocalOllama({
    model: "gemma3:12b", prompt: "Please list three tests.",
    requestFactory: mock.requestFactory
  });
  assert.equal(mock.record.calls, 1);
  assert.equal(mock.record.options.hostname, "127.0.0.1");
  assert.equal(mock.record.options.port, 11434);
  assert.equal(mock.record.options.path, "/api/generate");
  assert.equal(mock.record.options.method, "POST");
  assert.equal(mock.record.options.agent, false);
  assert.equal(mock.record.payload.model, "gemma3:12b");
  assert.equal(mock.record.payload.prompt, "Please list three tests.");
  assert.equal(mock.record.payload.stream, false);
  assert.equal(mock.record.payload.options.num_predict, 128);
  assert.equal(output.response, "Three tests: A, B, C");
  assert.equal(output.evalCount, 9);
});

test("302 is rejected, not followed", async () => {
  const mock = fakeTransport(302, { response: "don't follow" });
  await assert.rejects(postLocalOllama({
    model: "gemma3:12b", prompt: "safe", requestFactory: mock.requestFactory
  }), /HTTP 302/);
  assert.equal(mock.record.calls, 1);
});

test("malformed, incomplete, different-model outputs fail closed", async () => {
  for (const response of [
    { model: "gemma3:12b", done: false, response: "partial" },
    { model: "another:latest", done: true, response: "wrong model" },
    { model: "gemma3:12b", done: true },
    { model: "gemma3:12b", done: true, response: "x".repeat(8193) }
  ]) {
    const fake = fakeTransport(200, response);
    await assert.rejects(postLocalOllama({
      model: "gemma3:12b", prompt: "safe", requestFactory: fake.requestFactory
    }), /malformed or mismatched|exceeds 64 KiB/);
  }
});

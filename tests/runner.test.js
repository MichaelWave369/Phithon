import test from "node:test";
import assert from "node:assert/strict";
import { runInWorker } from "../src/language/runner.js";

class FakeWorker {
  constructor() { this.terminated = false; this.onmessage = null; this.onerror = null; this.sent = null; }
  postMessage(data) { this.sent = data; }
  terminate() { this.terminated = true; }
  reply(data) { this.onmessage?.({ data }); }
  crash(message) { this.onerror?.({ message, preventDefault() {} }); }
}

test("worker runner posts bounded source and resolves outputs", async () => {
  const fake = new FakeWorker();
  const request = runInWorker("print(9)", { workerFactory: () => fake, timeoutMs: 1000 });
  assert.equal(fake.sent.source, "print(9)");
  assert.equal(fake.sent.options.maxSteps, 30000);
  fake.reply({ ok: true, value: { output: ["9"], steps: 3 } });
  assert.deepEqual(await request, { output: ["9"], steps: 3 });
  assert.equal(fake.terminated, true);
});

test("worker runner transports PhiError messages", async () => {
  const fake = new FakeWorker();
  const request = runInWorker("invalid", { workerFactory: () => fake });
  fake.reply({ ok: false, error: { name: "PhiError", message: "PhiThon 1:1: bad syntax", line: 1, column: 1 } });
  await assert.rejects(request, /bad syntax/);
  assert.equal(fake.terminated, true);
});

test("worker runner rejects and terminates after wall-clock deadline", async () => {
  const fake = new FakeWorker();
  const request = runInWorker("while(true){}", { workerFactory: () => fake, timeoutMs: 10 });
  await assert.rejects(request, /time limit/);
  assert.equal(fake.terminated, true);
});

test("aborting terminates worker and rejects with AbortError", async () => {
  const fake = new FakeWorker(), controller = new AbortController();
  const request = runInWorker("while(true){}", { workerFactory: () => fake, signal: controller.signal });
  controller.abort();
  await assert.rejects(request, { name: "AbortError" });
  assert.equal(fake.terminated, true);
});

test("an already aborted signal spawns no worker", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runInWorker("print(1)", {
    signal: controller.signal,
    workerFactory: () => { throw new Error("should not spawn"); }
  }), { name: "AbortError" });
});

test("malformed and crashing worker messages reject", async () => {
  const fake = new FakeWorker();
  const request = runInWorker("print(1)", { workerFactory: () => fake });
  fake.reply({ nonsense: 1 });
  await assert.rejects(request, /Malformed/);
  assert.equal(fake.terminated, true);

  const another = new FakeWorker();
  const request2 = runInWorker("print(1)", { workerFactory: () => another });
  another.crash("failed");
  await assert.rejects(request2, /failed/);
  assert.equal(another.terminated, true);
});

test("invalid source is rejected before worker construction", async () => {
  await assert.rejects(runInWorker(null, { workerFactory: () => new FakeWorker() }), /source must be text/);
});

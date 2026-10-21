import test from "node:test";
import assert from "node:assert/strict";
import { runInWorker } from "../src/language/runner.js";

class StubWorker {
  sent = null;
  onmessage = null;
  onerror = null;
  terminated = false;
  postMessage(data) { this.sent = data; }
  terminate() { this.terminated = true; }
}
test("R4 web worker forwards local module source registry without network access", async () => {
  const mock = new StubWorker();
  const pending = runInWorker("import numbers;print(numbers_double(2))", {
    modules: { numbers: "export fn double(x){return x*2}" },
    workerFactory: () => mock
  });
  assert.deepEqual(mock.sent.options.modules, { numbers: "export fn double(x){return x*2}" });
  mock.onmessage({ data: { ok: true, value: { output: ["4"], steps: 12, result: "null", ledger: [] } } });
  assert.deepEqual((await pending).output, ["4"]);
  assert.equal(mock.terminated, true);
});

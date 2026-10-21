import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runInWorker } from "../src/language/runner.js";

const cli = resolve("src/cli.js");
function command(args, stdio = "pipe") {
  return execFileSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: 10_000,
    stdio: stdio === "pipe" ? ["ignore", "pipe", "pipe"] : stdio
  });
}
test("CLI --brain-out explicitly grants request stage and produces NOT_SENT file", async () => {
  const folder = await mkdtemp(join(tmpdir(), "phithon-brain-"));
  try {
    const file = join(folder, "plan.phi"), out = join(folder, "requests.json");
    const program = 'use brain\nprint(brain_request("spv","Hello SPV"))\n';
    await writeFile(file, program, "utf8");
    assert.throws(() => command([file]), /Command failed/);
    await assert.rejects(access(out));
    const ok = command(["--brain-out", out, file]);
    assert.match(ok, /NOT SENT/);
    const handoff = JSON.parse(await readFile(out, "utf8"));
    assert.deepEqual(handoff.requests, [{ id: 1, route: "spv", prompt: "Hello SPV" }]);
    assert.equal(handoff.status, "NOT_SENT");
    // Refuse to overwrite, do not silently re-authorize.
    assert.throws(() => command(["--brain-out", out, file]), /Command failed/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
test("CLI --brain-out rejects programs that stage zero brain requests", async () => {
  const folder = await mkdtemp(join(tmpdir(), "phithon-brain-empty-"));
  try {
    const input = join(folder, "empty.phi"), out = join(folder, "handoff.json");
    await writeFile(input, "print(369)", "utf8");
    assert.throws(() => command(["--brain-out", out, input]), /Command failed/);
    await assert.rejects(access(out));
  } finally { await rm(folder, { recursive: true, force: true }); }
});
test("browser Worker transport never acquires a PhiBrain grant by default", async () => {
  class FakeWorker {
    postMessage(data) { this.data = data; }
    terminate() {}
  }
  const stub = new FakeWorker();
  const task = runInWorker('use brain\nbrain_request("local","test")', {
    workerFactory: () => stub
  });
  assert.equal(stub.data.options.brainGrant, false);
  stub.onmessage({ data: { ok: false, error: { message: "PhiBrain permission denied" } } });
  await assert.rejects(task, /permission denied/);
});
test("browser Worker transport carries exactly an explicit PhiBrain grant", async () => {
  class FakeWorker {
    postMessage(data) { this.data = data; }
    terminate() {}
  }
  const stub = new FakeWorker();
  const task = runInWorker('use brain\nbrain_request("local","test")', {
    brainGrant: true, workerFactory: () => stub
  });
  assert.equal(stub.data.options.brainGrant, true);
  stub.onmessage({ data: { ok: true, value: { output: [], result: "null", ledger: [], steps: 5, brainRequests: [{ id: 1, route: "local", prompt: "test" }] } } });
  const output = await task;
  assert.equal(output.brainRequests.length, 1);
});

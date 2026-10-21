import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runIsolated } from "../src/cli/isolate.js";

const CLI = resolve("src/cli.js");

test("PhiShield executes a .phi program out of process", async () => {
  const result = await runIsolated('print("PhiShield ✓", 2+3)\nledger("RUN","demo")');
  assert.deepEqual(result.output, ["PhiShield ✓ 5"]);
  assert.deepEqual(result.ledger.map(e => e.event), ["RUN"]);
  assert.ok(result.steps > 0);
});

test("check mode parses without evaluating expressions", async () => {
  const source = 'while(true) { print("should not execute") }';
  const result = await runIsolated(source, { mode: "check" });
  assert.equal(result.valid, true);
  assert.ok(result.statements > 0);
  assert.ok(result.tokens > 0);
  assert.equal(result.output, undefined);
});

test("syntax errors propagate without hanging the CLI", async () => {
  await assert.rejects(runIsolated("let x ="), /Expected expression/);
});

test("runtime errors propagate from the child", async () => {
  await assert.rejects(runIsolated("print(1/0)"), /Division by zero/);
});

test("deadline terminates a child before completion", async () => {
  // One millisecond is far less than a fresh Node subprocess startup time.
  await assert.rejects(runIsolated('print("startup")', { timeoutMs: 1 }), /deadline/);
});

test("an aborted controller prevents subprocess launch", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runIsolated("print(1)", { signal: controller.signal }), /cancelled/);
});

test("parameter guards reject unexpected modes and invalid sources", async () => {
  await assert.rejects(runIsolated("print(1)", { mode: "shell" }), /unsupported mode/);
  await assert.rejects(runIsolated("print(1)", { timeoutMs: 20_000 }), /timeoutMs/);
  await assert.rejects(runIsolated("x".repeat(100_001)), /too large/);
});

test("PhiShield CLI check works and does not execute malicious-looking logic", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phithon-check-"));
  const good = join(directory, "syntax.phi");
  const bad = join(directory, "broken.phi");
  try {
    await writeFile(good, 'while (true) { print("not executed") }\n', "utf8");
    await writeFile(bad, "let = 1", "utf8");
    const output = execFileSync(process.execPath, [CLI, "check", good], {
      encoding: "utf8", timeout: 10_000
    });
    assert.match(output, /Syntax OK/);
    assert.doesNotMatch(output, /not executed/);
    assert.throws(() => execFileSync(process.execPath, [CLI, "check", bad], {
      stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 10_000
    }), /Command failed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI normal execution still produces program output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phithon-exec-"));
  const path = join(dir, "hello.phi");
  try {
    await writeFile(path, 'print("working", 369)\n', "utf8");
    const result = execFileSync(process.execPath, [CLI, path], {
      encoding: "utf8", timeout: 10_000
    });
    assert.match(result, /working 369/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

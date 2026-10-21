import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli.js");
const sample = resolve("examples/spv-evidence-bench.SYNTHETIC.json");
function command(args) {
  return execFileSync(process.execPath, [cli, ...args], {
    encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"]
  });
}

test("R8 CLI inspects actual SPV-compatible portable bench sample offline", () => {
  const output = command(["spv-bench-inspect", sample]);
  assert.match(output, /READ_ONLY_UNATTESTED_IMPORT/);
  assert.match(output, /Evidence entries: 2/);
  assert.match(output, /Performance entries: 1/);
  assert.match(output, /Human review entries: 1/);
  assert.match(output, /matching self-review: 1/);
  assert.match(output, /REDACTED/);
  assert.doesNotMatch(output, /fixture-model:1b/);
  assert.doesNotMatch(output, /"helpfulness"/);
});

test("R8 CLI model labels require explicit --models flag", () => {
  const output = command(["spv-bench-inspect", sample, "--models"]);
  assert.match(output, /fixture-model:1b/);
});

test("R8 refuses extra flags and malformed imports without side effects", async () => {
  assert.throws(() => command(["spv-bench-inspect", sample, "--run-model"]), /Command failed/);
  const dir = await mkdtemp(join(tmpdir(), "phithon-spv-audit-"));
  try {
    const poisoned = join(dir, "poisoned.json");
    const fixture = JSON.parse(await readFile(sample, "utf8"));
    fixture.authority_granted = true;
    await writeFile(poisoned, JSON.stringify(fixture), "utf8");
    assert.throws(() => command(["spv-bench-inspect", poisoned]), /Command failed/);
    fixture.authority_granted = false;
    fixture.entries[0].private_prompt = "KEEP_PRIVATE";
    await writeFile(poisoned, JSON.stringify(fixture), "utf8");
    assert.throws(() => command(["spv-bench-inspect", poisoned]), /Command failed/);
    await writeFile(poisoned, "x".repeat(65537), "utf8");
    assert.throws(() => command(["spv-bench-inspect", poisoned]), /Command failed/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("existing PhiThon help and examples still work after adding SPV inspector", () => {
  assert.match(command(["--help"]), /spv-bench-inspect/);
  assert.match(command([resolve("examples/hello.phi")]), /Welcome to PhiThon/);
});

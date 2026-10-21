import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli.js");

test("CLI seals a .phi file and verifies JSON receipts, rejecting tampering", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phithon-receipt-"));
  const file = join(directory, "demo.phi");
  const receiptFile = file + ".receipt.json";
  try {
    await writeFile(file, 'print("hello")\nledger("TEST","simulated")\n', "utf8");
    const made = execFileSync(process.execPath, [cli, "--receipt", file], { encoding: "utf8" });
    assert.match(made, /Saved integrity receipt/);
    assert.match(made, /Receipt SHA-256: [0-9a-f]{64}/);

    const receipt = JSON.parse(await readFile(receiptFile, "utf8"));
    assert.equal(receipt.events.length, 1);
    assert.equal(receipt.events[0].provenance, "SIMULATED");

    const verified = execFileSync(process.execPath, [cli, "verify", receiptFile], { encoding: "utf8" });
    assert.match(verified, /INTEGRITY VALID/);

    receipt.execution.output[0] = "tampered";
    await writeFile(receiptFile, JSON.stringify(receipt), "utf8");
    assert.throws(() => execFileSync(process.execPath, [cli, "verify", receiptFile], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
    }), /Command failed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI --help documents integrity limitations", () => {
  const output = execFileSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.match(output, /NOT an identity signature/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { verifyReceipt, PACKAGE_RECEIPT_SCHEMA } from "../src/ledger/receipts.js";

const cli = resolve("src/cli.js");
const example = resolve("examples/packages");
function call(...args) {
  return execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 10_000 });
}
function callFail(...args) {
  assert.throws(() => execFileSync(process.execPath, [cli, ...args], {
    encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"]
  }), /Command failed/);
}
test("CLI creates v2 package receipt and matches its original on-disk sources", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phithon-module-receipt-"));
  try {
    for (const name of ["main.phi", "numbers.phi", "geometry.phi", "phithon.pack.json"]) {
      await copyFile(join(example, name), join(dir, name));
    }
    const main = join(dir, "main.phi");
    const saved = main + ".receipt.json";
    assert.match(call("--receipt", main), /phithon.execution-receipt.v2/);
    const receipt = JSON.parse(await readFile(saved, "utf8"));
    assert.equal(receipt.schema, PACKAGE_RECEIPT_SCHEMA);
    assert.equal(Object.keys(receipt.modules).length, 2);
    assert.equal((await verifyReceipt(receipt)).valid, true);
    assert.match(call("verify", saved), /INTEGRITY VALID/);
    assert.match(call("verify-project", saved, main), /PROJECT MATCH/);
    await writeFile(join(dir, "numbers.phi"), receipt.modules.numbers.replace("multiplier = 3", "multiplier = 4"), "utf8");
    // The saved receipt describes the past source snapshot and remains self-consistent.
    assert.match(call("verify", saved), /INTEGRITY VALID/);
    // Explicitly comparing against current disk files detects the library modification.
    callFail("verify-project", saved, main);
    // Existing receipt paths are never overwritten.
    callFail("--receipt", main);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("v1 standalone receipt matches standalone source but not a package-loaded project", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phithon-legacy-v1-"));
  try {
    const entry = join(dir, "standalone.phi");
    await writeFile(entry, 'print("legacy")\n', "utf8");
    const output = call("--receipt", entry);
    assert.match(output, /phithon.execution-receipt.v1/);
    const receiptPath = entry + ".receipt.json";
    assert.match(call("verify-project", receiptPath, entry), /PROJECT MATCH/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

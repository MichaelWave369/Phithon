import test from "node:test";
import assert from "node:assert/strict";
import { execute } from "../src/language/core.js";
import { createReceipt, createPackageReceipt, verifyReceipt, PACKAGE_RECEIPT_SCHEMA, RECEIPT_SCHEMA } from "../src/ledger/receipts.js";

const timestamp = "2026-10-21T16:00:00.000Z";
const modules = {
  numbers: "export fn triple(x) { return x * 3 }",
  geometry: "import numbers\nexport fn scaled(x) { return numbers_triple(x) * 2 }"
};
const source = 'import geometry\nprint("Answer:", geometry_scaled(7))\nledger("PACKAGED", "SIMULATED")';
const snapshot = value => structuredClone(value);
async function sealed() {
  return createPackageReceipt(source, execute(source, { modules }), modules, { createdAt: timestamp });
}

test("PhiLedger v2 binds entire local package source and simulated event chain", async () => {
  const receipt = await sealed();
  assert.equal(receipt.schema, PACKAGE_RECEIPT_SCHEMA);
  assert.equal(receipt.execution.output[0], "Answer: 42");
  assert.equal(receipt.moduleSetHash.length, 64);
  assert.equal(receipt.moduleHashes.numbers.length, 64);
  assert.equal(receipt.events[0].previousHash, receipt.genesisHash);
  assert.equal(receipt.headHash, receipt.events[0].hash);
  const verified = await verifyReceipt(receipt);
  assert.equal(verified.valid, true, verified.reason);
  assert.equal(verified.modules, 2);
});

test("standalone R2 v1 receipts still verify unchanged", async () => {
  const lone = "print(2+3)";
  const old = await createReceipt(lone, execute(lone), { createdAt: timestamp });
  assert.equal(old.schema, RECEIPT_SCHEMA);
  assert.equal((await verifyReceipt(old)).valid, true);
  assert.notEqual(old.schema, PACKAGE_RECEIPT_SCHEMA);
});

test("v2 digest is deterministic irrespective of module-map ordering", async () => {
  const first = await sealed();
  const reversed = { geometry: modules.geometry, numbers: modules.numbers };
  const second = await createPackageReceipt(source, execute(source, { modules: reversed }), reversed, { createdAt: timestamp });
  assert.equal(first.moduleSetHash, second.moduleSetHash);
  assert.equal(first.receiptHash, second.receiptHash);
  const reorder = Object.fromEntries(Object.entries(snapshot(first)).reverse());
  assert.equal((await verifyReceipt(reorder)).valid, true);
});

test("one-byte module edit invalidates source-complete v2 receipt", async () => {
  const changed = snapshot(await sealed());
  changed.modules.numbers = changed.modules.numbers.replace("x * 3", "x * 4");
  assert.equal((await verifyReceipt(changed)).valid, false);
});

test("module removal and module substitution invalidate old hash", async () => {
  const original = await sealed();
  const deleted = snapshot(original);
  delete deleted.modules.numbers;
  assert.equal((await verifyReceipt(deleted)).valid, false);

  const duplicate = snapshot(original);
  duplicate.modules.numbers = original.modules.geometry;
  assert.equal((await verifyReceipt(duplicate)).valid, false);
});

test("tampering with module hash, set root, source or output invalidates receipt", async () => {
  const original = await sealed();
  for (const alter of [
    r => { r.moduleHashes.numbers = "0".repeat(64); },
    r => { r.moduleSetHash = "a".repeat(64); },
    r => { r.source = r.source + "\n"; },
    r => { r.execution.output[0] = "Answer: 43"; },
    r => { r.events[0].data = "changed"; },
    r => { r.receiptHash = "b".repeat(64); }
  ]) {
    const changed = snapshot(original); alter(changed);
    assert.equal((await verifyReceipt(changed)).valid, false);
  }
});

test("extra fields, invalid module maps and unknown schema fail closed", async () => {
  const receipt = await sealed();
  const extra = snapshot(receipt); extra.modules.bad_extra = "export let x=9";
  assert.equal((await verifyReceipt(extra)).valid, false);
  const unknown = snapshot(receipt); unknown.schema = "phithon.execution-receipt.v300";
  assert.equal((await verifyReceipt(unknown)).valid, false);
  const missingHash = snapshot(receipt); delete missingHash.moduleHashes.numbers;
  assert.equal((await verifyReceipt(missingHash)).valid, false);
  await assert.rejects(createPackageReceipt(source, execute(source, { modules }), {}, { createdAt: timestamp }), /at least one module/);
});

test("cycles and unresolved imports block creation without executing code", async () => {
  await assert.rejects(
    createPackageReceipt("import x", { output: [], result: "null", steps: 2, ledger: [] },
      { x: "import x\nexport let n = 1" }),
    /circular import/
  );
  await assert.rejects(
    createPackageReceipt("import not_present", { output: [], result: "null", steps: 2, ledger: [] },
      { numbers: "export let n = 1" }),
    /unresolved import/
  );
});

test("v2 verification parses imported source but does not execute it", async () => {
  // The claimed transcript could be forged, and the verifier does NOT replay it.
  const dangerous = 'import numbers\nwhile(true){}';
  const fake = await createPackageReceipt(
    dangerous, { output: ["fictional result"], result: "null", steps: 1, ledger: [] },
    { numbers: modules.numbers },
    { createdAt: timestamp }
  );
  assert.equal((await verifyReceipt(fake)).valid, true);
  // A valid digest only means internal consistency, not attested execution.
});

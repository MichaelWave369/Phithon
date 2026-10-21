import test from "node:test";
import assert from "node:assert/strict";
import { execute } from "../src/language/core.js";
import { createReceipt, verifyReceipt, RECEIPT_SCHEMA } from "../src/ledger/receipts.js";

const stamp = "2026-10-21T12:00:00.000Z";
function sample() {
  const source = [
    'print("PhiThon integrity")',
    'ledger("OBSERVATION", "simulation only")',
    'ledger("COMPLETE", "two simulated events")'
  ].join("\n");
  return { source, execution: execute(source) };
}
const clone = (value) => structuredClone(value);
async function sealedSample() {
  const { source, execution } = sample();
  return createReceipt(source, execution, { createdAt: stamp });
}

test("SHA-256 seal produces a portable, self-consistent receipt", async () => {
  const receipt = await sealedSample();
  assert.equal(receipt.schema, RECEIPT_SCHEMA);
  assert.match(receipt.sourceHash, /^[a-f0-9]{64}$/);
  assert.match(receipt.genesisHash, /^[a-f0-9]{64}$/);
  assert.match(receipt.receiptHash, /^[a-f0-9]{64}$/);
  assert.equal(receipt.events.length, 2);
  assert.equal(receipt.events[0].previousHash, receipt.genesisHash);
  assert.equal(receipt.events[1].previousHash, receipt.events[0].hash);
  assert.equal(receipt.headHash, receipt.events[1].hash);
  const verified = await verifyReceipt(receipt);
  assert.equal(verified.valid, true, verified.reason);
});

test("serialization and object key reordering do not break canonical integrity", async () => {
  const receipt = await sealedSample();
  const decoded = JSON.parse(JSON.stringify(receipt));
  const reordered = Object.fromEntries(Object.entries(decoded).reverse());
  assert.equal((await verifyReceipt(reordered)).valid, true);
});

test("the same transcript and timestamp get the same root digest", async () => {
  const a = await sealedSample(), b = await sealedSample();
  assert.equal(a.receiptHash, b.receiptHash);
});

test("a changed program source fails verification", async () => {
  const mutated = clone(await sealedSample());
  mutated.source += "\nprint('forged')";
  assert.equal((await verifyReceipt(mutated)).valid, false);
});

test("a changed console transcript fails verification", async () => {
  const mutated = clone(await sealedSample());
  mutated.execution.output[0] = "pretend result";
  assert.equal((await verifyReceipt(mutated)).valid, false);
});

test("modified, deleted and reordered events all fail verification", async () => {
  const original = await sealedSample();
  const edit = clone(original);
  edit.events[0].data = "edited";
  assert.equal((await verifyReceipt(edit)).valid, false);

  const deleted = clone(original);
  deleted.events.splice(0, 1);
  assert.equal((await verifyReceipt(deleted)).valid, false);

  const swapped = clone(original);
  swapped.events.reverse();
  assert.equal((await verifyReceipt(swapped)).valid, false);
});

test("changed hash, timestamp and steps fail verification", async () => {
  const original = await sealedSample();
  for (const mutate of [
    r => { r.receiptHash = "0".repeat(64); },
    r => { r.createdAt = "2027-10-21T12:00:00.000Z"; },
    r => { r.execution.steps++; },
    r => { r.headHash = "f".repeat(64); }
  ]) {
    const changed = clone(original);
    mutate(changed);
    assert.equal((await verifyReceipt(changed)).valid, false);
  }
});

test("no ledger entries still yield a hashed transcript receipt", async () => {
  const source = "print(2+3)";
  const receipt = await createReceipt(source, execute(source), { createdAt: stamp });
  assert.equal(receipt.events.length, 0);
  assert.equal(receipt.headHash, receipt.genesisHash);
  assert.equal((await verifyReceipt(receipt)).valid, true);
});

test("invalid or non-simulated input events are rejected", async () => {
  const { source, execution } = sample();
  const fake = clone(execution);
  fake.ledger[0].provenance = "VERIFIED";
  await assert.rejects(createReceipt(source, fake), /SIMULATED/);
  fake.ledger[0].provenance = "SIMULATED";
  fake.ledger[0].sequence = 9;
  await assert.rejects(createReceipt(source, fake), /sequential/);
});

test("invalid JSON objects, unknown algorithms and added fields fail closed", async () => {
  assert.equal((await verifyReceipt(null)).valid, false);
  assert.equal((await verifyReceipt({})).valid, false);
  const original = await sealedSample();
  const changedAlgorithm = clone(original);
  changedAlgorithm.algorithm = "MD5";
  assert.equal((await verifyReceipt(changedAlgorithm)).valid, false);
  const withField = clone(original);
  withField.fakeApproval = true;
  assert.equal((await verifyReceipt(withField)).valid, false);
  const withEventField = clone(original);
  withEventField.events[0].signedBy = "someone";
  assert.equal((await verifyReceipt(withEventField)).valid, false);
});

test("a fully new self-consistent receipt is valid but does NOT prove authorship", async () => {
  const forgedSource = 'print("invented")';
  const forged = await createReceipt(forgedSource, execute(forgedSource), { createdAt: stamp });
  assert.equal((await verifyReceipt(forged)).valid, true);
  // A public hash with no trusted anchor or signature cannot identify its creator.
  assert.notEqual(forged.receiptHash, (await sealedSample()).receiptHash);
});

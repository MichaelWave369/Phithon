import test from "node:test";
import assert from "node:assert/strict";
import { execute } from "../src/language/core.js";
import { runIsolated } from "../src/cli/isolate.js";
import { makeBrainHandoff, validateBrainRequests, BRAIN_HANDOFF_SCHEMA } from "../src/brain/handoff.js";
import { createReceipt, verifyReceipt } from "../src/ledger/receipts.js";

const prompt = "Summarize the plan for PhiThon.";
const program = 'use brain\nlet ticket = brain_request("spv", "' + prompt + '")\nprint(ticket)';

test("PhiBrain capability is denied by default even when use brain is present", () => {
  assert.throws(() => execute(program), /permission denied/);
  assert.throws(() => execute(program, { brainGrant: false }), /permission denied/);
  assert.throws(() => execute(program, { brainGrant: "yes" }), /permission denied/);
});

test("brain_request is unavailable unless the module is explicitly loaded", () => {
  assert.throws(() => execute('brain_request("manual","test")', { brainGrant: true }), /Unknown name/);
});

test("explicit permission stages bounded inert request data with SIMULATED ledger event", () => {
  const result = execute(program, { brainGrant: true });
  assert.deepEqual(result.output, ["1"]);
  assert.deepEqual(result.brainRequests, [{ id: 1, route: "spv", prompt }]);
  assert.equal(result.ledger[0].event, "BRAIN_REQUEST");
  assert.equal(result.ledger[0].provenance, "SIMULATED");
  assert.deepEqual(JSON.parse(result.ledger[0].data), result.brainRequests[0]);
});

test("supported routes are intentions, not model/provider execution", () => {
  const output = execute('use brain\nprint(brain_request("manual","A"), brain_request("local","B"), brain_request("spv","C"))', { brainGrant: true });
  assert.deepEqual(output.brainRequests.map(r => r.route), ["manual", "local", "spv"]);
  assert.deepEqual(output.output, ["1 2 3"]);
});

test("invalid route, empty/oversized prompt and more than five requests fail", () => {
  assert.throws(() => execute('use brain\nbrain_request("https://example.com","x")', { brainGrant: true }), /route must/);
  assert.throws(() => execute('use brain\nbrain_request("spv","")', { brainGrant: true }), /prompt must/);
  assert.throws(() => execute('use brain\nbrain_request("spv"," ")', { brainGrant: true }), /prompt must/);
  const many = ['use brain', ...Array(6).fill('brain_request("manual","small")')].join("\n");
  assert.throws(() => execute(many, { brainGrant: true }), /quota exceeded/);
  const large = 'use brain\nbrain_request("manual", "' + "x".repeat(2049) + '")';
  assert.throws(() => execute(large, { brainGrant: true }), /prompt must/);
});

test("build handoff is manual-only, NOT_SENT, and rejects malformed requests", () => {
  const result = execute(program, { brainGrant: true });
  const handoff = makeBrainHandoff(result.brainRequests);
  assert.equal(handoff.schema, BRAIN_HANDOFF_SCHEMA);
  assert.equal(handoff.status, "NOT_SENT");
  assert.equal(handoff.delivery, "MANUAL_EXPORT_ONLY");
  assert.equal(handoff.provenance, "SIMULATED");
  assert.deepEqual(handoff.requests, result.brainRequests);
  assert.throws(() => makeBrainHandoff([]), /no requests/);
  assert.throws(() => validateBrainRequests([{ id: 50, route: "spv", prompt: "oops" }]), /invalid request/);
  assert.throws(() => validateBrainRequests([{ id: 1, route: "spv", prompt: "yes", endpoint: "https://host" }]), /invalid request/);
});

test("PhiShield child honors explicit boolean grant, still does not dispatch", async () => {
  await assert.rejects(runIsolated(program), /permission denied/);
  const result = await runIsolated(program, { brainGrant: true });
  assert.deepEqual(result.brainRequests, [{ id: 1, route: "spv", prompt }]);
  await assert.rejects(runIsolated(program, { brainGrant: "yes" }), /brainGrant must be boolean/);
});

test("prior SIMULATED receipt chains include entire brain prompt event without claiming transmission", async () => {
  const result = execute(program, { brainGrant: true });
  const receipt = await createReceipt(program, result, { createdAt: "2026-10-21T19:00:00.000Z" });
  assert.equal((await verifyReceipt(receipt)).valid, true);
  const tampered = structuredClone(receipt);
  tampered.events[0].data = "forged";
  assert.equal((await verifyReceipt(tampered)).valid, false);
});

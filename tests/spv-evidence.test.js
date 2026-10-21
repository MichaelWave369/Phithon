import test from "node:test";
import assert from "node:assert/strict";
import {
  SPV_BENCH_SCHEMA, SPV_BENCH_MAX_BYTES, validateSpvBench,
  inspectSpvBench, inspectSpvBenchJson
} from "../src/bridge/spv-evidence.js";

const A = "a".repeat(64);
const iso1 = "2026-10-21T18:00:00.000Z";
const iso2 = "2026-10-21T18:03:00.000Z";
const created = "2026-10-21T19:00:00.000Z";
const performance = () => ({
  kind: "PERFORMANCE_RECEIPT",
  model: "qwen3:4b",
  output_sha256: A,
  observed_at: iso1,
  protocol_id: "governance-one-sentence-v1",
  trial_elapsed_ms: 12500,
  model_load_ns: 2000,
  prompt_eval_ns: 3100,
  generation_eval_ns: 4400,
  generated_tokens: 64,
  prompt_tokens: 27,
  token_cap_requested: 64,
  token_cap_reached: true,
  stop_reason: "stop",
  provenance: "IMPORTED_OR_OPERATOR_CAPTURED_UNATTESTED",
  prompt_included: false,
  generated_text_included: false,
  authority_granted: false
});
const review = () => ({
  kind: "HUMAN_REVIEW",
  model: "qwen3:4b",
  output_sha256: A,
  observed_at: iso2,
  helpfulness: "4",
  completeness: "POSSIBLY_CUT_OFF",
  verification: "NOT_CHECKED",
  provenance: "OPERATOR_SELF_REPORT_UNATTESTED",
  prompt_included: false,
  generated_text_included: false,
  authority_granted: false
});
const bundle = () => ({
  schema: SPV_BENCH_SCHEMA,
  created_at: created,
  scope: "OPERATOR_CHOSEN_PORTABLE_REDACTED",
  source_trust: "UNATTESTED_OPERATOR_SELECTED_JSON",
  max_entries: 24,
  evidence_count: 2,
  entries: [performance(), review()],
  prompt_included: false,
  generated_text_included: false,
  free_text_notes_included: false,
  automatic_ranking_performed: false,
  quality_gate_approved: false,
  model_routing_approved: false,
  cloud_execution_approved: false,
  authority_granted: false
});
const clone = value => structuredClone(value);

test("R8 accepts authentic SPV portable bench v0.1 structure without promoting authority", () => {
  const raw = bundle();
  assert.equal(validateSpvBench(raw), raw);
  const read = inspectSpvBenchJson(JSON.stringify(raw));
  assert.equal(read.evidenceCount, 2);
  assert.equal(read.performanceCount, 1);
  assert.equal(read.humanReviewCount, 1);
  assert.equal(read.performanceRowsWithMatchingReview, 1);
  assert.equal(read.modelLabelCount, 1);
  assert.equal(read.rows[0].model, "REDACTED");
  assert.equal(read.rows[0].generatedTokens, 64);
  assert.equal(read.authorityGranted, false);
  assert.equal(read.routingApproved, false);
  assert.equal(read.inferencePerformed, false);
  assert.equal(read.rankingPerformed, false);
  assert.equal(read.status, "READ_ONLY_UNATTESTED_IMPORT");
  assert.doesNotMatch(JSON.stringify(read), new RegExp(A));
  assert.doesNotMatch(JSON.stringify(read), /"helpfulness"/);
});
test("model labels appear only with explicit disclosure parameter", () => {
  assert.equal(inspectSpvBench(bundle()).rows[0].model, "REDACTED");
  assert.equal(inspectSpvBench(bundle(), { showModelNames: true }).rows[0].model, "qwen3:4b");
});
test("older performance entry without optional protocol_id remains compatible", () => {
  const raw = bundle();
  delete raw.entries[0].protocol_id;
  assert.equal(inspectSpvBench(raw).rows[0].protocolId, null);
});
test("reject unknown fields at top-level or in evidence, refusing hidden prompts/answers", () => {
  const original = bundle();
  for (const mutation of [
    r => { r.private_prompt = "secret"; },
    r => { r.entries[0].prompt = "secret"; },
    r => { r.entries[0].response = "secret"; },
    r => { r.entries[1].free_text_note = "secret"; },
    r => { r.entries[0].authorization_header = "Bearer secret"; }
  ]) {
    const changed = clone(original);
    mutation(changed);
    assert.throws(() => inspectSpvBench(changed), /PhiBridge:/);
  }
});
test("refuse forged authority, routing, quality promotion or privacy flags", () => {
  const original = bundle();
  for (const mutation of [
    r => { r.quality_gate_approved = true; },
    r => { r.model_routing_approved = true; },
    r => { r.authority_granted = true; },
    r => { r.automatic_ranking_performed = true; },
    r => { r.cloud_execution_approved = true; },
    r => { r.entries[0].authority_granted = true; },
    r => { r.entries[1].generated_text_included = true; }
  ]) {
    const raw = clone(original);
    mutation(raw);
    assert.throws(() => validateSpvBench(raw), /PhiBridge:/);
  }
});
test("reject fabricated review ratings, attestations and unknown fixed protocol IDs", () => {
  const original = bundle();
  for (const mutation of [
    r => { r.entries[1].helpfulness = "INDEPENDENTLY_VERIFIED"; },
    r => { r.entries[1].verification = "VERIFIED"; },
    r => { r.entries[1].provenance = "AUTHENTIC"; },
    r => { r.entries[0].protocol_id = "paid-cloud-override"; },
    r => { r.entries[0].stop_reason = "AI_APPROVED"; },
    r => { r.entries[0].trial_elapsed_ms = -20; },
    r => { r.entries[0].token_cap_requested = 200; }
  ]) {
    const raw = clone(original); mutation(raw);
    assert.throws(() => validateSpvBench(raw), /PhiBridge:/);
  }
});
test("a human self-review pairs only by both model and output SHA", () => {
  const raw = bundle();
  raw.entries[1].model = "different-model";
  assert.equal(inspectSpvBench(raw).performanceRowsWithMatchingReview, 0);
  raw.entries[1].model = "qwen3:4b";
  raw.entries[1].output_sha256 = "b".repeat(64);
  assert.equal(inspectSpvBench(raw).performanceRowsWithMatchingReview, 0);
});
test("refuse duplicates, invalid timestamps, mismatched counts and malformed input", () => {
  const original = bundle();
  const dup = clone(original);
  dup.entries[1] = clone(dup.entries[0]);
  assert.throws(() => validateSpvBench(dup), /DUPLICATE/);
  for(const mutation of [
    r => { r.evidence_count = 24; },
    r => { r.created_at = "tomorrow"; },
    r => { r.max_entries = 50; },
    r => { r.source_trust = "VERIFIED_SOURCE"; }
  ]) {
    const raw = clone(original); mutation(raw);
    assert.throws(() => validateSpvBench(raw), /PhiBridge:/);
  }
  assert.throws(() => inspectSpvBenchJson("{bad json"), /INVALID_JSON/);
  assert.throws(() => inspectSpvBenchJson(" ".repeat(SPV_BENCH_MAX_BYTES + 1)), /BUNDLE_TOO_LARGE/);
  assert.throws(() => inspectSpvBenchJson(42), /BUNDLE_TOO_LARGE/);
});
test("supports Unicode-safe buffer size check for operator-selected JSON", () => {
  const raw = bundle();
  raw.entries[0].model = "modèle-α";
  assert.equal(inspectSpvBenchJson(JSON.stringify(raw)).modelLabelCount, 2);
});

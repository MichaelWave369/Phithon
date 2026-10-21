import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createVibePhiLink } from "../src/bridge/vibe-intent.js";
import {
  VIBE_PROOF_BRIEF_VERSION, VIBE_PROOF_CORRESPONDENCE_SCHEMA,
  validateVibeProofBrief, inspectVibeProofBrief, inspectVibeProofBriefJson,
  createVibeProofCorrespondence, verifyVibeProofCorrespondence
} from "../src/bridge/vibe-proof.js";

const hash = x => createHash("sha256").update(x, "utf8").digest("hex");
const vibeSource = 'intent ProofExample:\n  goal: "Report a value"\n  inputs:\n    value: number\n  outputs:\n    result: number\nemit python\n';
const phiSource = "print(40 + 2)\n";
const brief = () => ({
  brief_version: "phase-8.4.intent-brief.v1",
  source_path: "private/ProofExample.vibe",
  source_sha256: hash(vibeSource),
  intent: { name:"ProofExample", goal:"Report a value", inputs:[{name:"value",type:"number"}], outputs:[{name:"result",type:"number"}] },
  preserve: [], constraints: [], bridge: [], emit_target: "python", domain_profile: null,
  interchange_metadata: { source_kind:"vibe_spec", transformation_state:"raw_intent_contract" }
});
const proofBrief = (passed = true) => ({
  brief_version: VIBE_PROOF_BRIEF_VERSION,
  proof_path: "private/ProofExample.vibe.proof.json",
  proof_artifact_version: "v1",
  source_path: "private/ProofExample.vibe",
  verification_backend: "heuristic",
  result: { passed, emission_blocked: !passed },
  intent_summary: {
    source_hash: hash(vibeSource),
    ir_hash: "b".repeat(64),
    emit_target: "python",
    package_context: {},
    domain_profile: null,
    self_hosting: {}
  },
  preserve_constraint_summary: {
    obligation_summary: { satisfied: passed ? 2 : 1, violated: passed ? 0 : 1 },
    obligations_sample: [
      { obligation_id: "preserve-1", category: "preserve", status: passed ? "satisfied" : "violated", critical: true }
    ],
    obligations_total: 2
  },
  bridge_result: {
    bridge_score: passed ? 0.92 : 0.23,
    verdict: passed ? "preserved" : "not_preserved",
    measurement_ratio: 0.89,
    epsilon_metrics: {epsilon_pre:0.5, epsilon_post:0.08}
  },
  equivalence_drift_summary: {
    intent_equivalence_score: 0.92,
    drift_score: 0.08,
    intent_items_total: 4,
    intent_items_missing: 0,
    intent_items_unknown: 0
  },
  interchange_metadata: {
    source_kind: "proof_artifact", consumer_safe: true, deterministic_projection: true,
    notes: [
      "Derived from existing proof artifact fields.",
      "Represents machine-readable understanding, not full formal behavior proof."
    ]
  }
});
const linking = async () => createVibePhiLink(brief(), vibeSource, phiSource);

test("R10 consumes Vibe's actual Phase 8.4 proof-brief key structure", () => {
  const info = inspectVibeProofBriefJson(JSON.stringify(proofBrief()));
  assert.equal(info.compilerPassReported, true);
  assert.equal(info.emissionBlockedReported, false);
  assert.equal(info.obligationsTotalReported, 2);
  assert.equal(info.obligationsSampled, 1);
  assert.equal(info.reportTrust, "OPERATOR_IMPORTED_UNATTESTED");
  assert.equal(info.originalProofArtifactChecked, false);
  assert.equal(info.originalSourceHashChecked, false);
  assert.equal(info.phithonEquivalent, false);
  assert.equal(info.executionAuthorized, false);
  assert.doesNotMatch(JSON.stringify(info), /private\/ProofExample/);
});

test("Vibe compiler's reported PASS does NOT certify PhiThon implementation", async () => {
  const link = await linking();
  const comparison = await createVibeProofCorrespondence(
    link, proofBrief(true), brief(), vibeSource, phiSource
  );
  assert.equal(comparison.schema, VIBE_PROOF_CORRESPONDENCE_SCHEMA);
  assert.equal(comparison.report.compilerPassReported, true);
  assert.equal(comparison.checks.vibeBriefAndProofHashesMatchSuppliedSource, true);
  for(const flag of ["proofArtifactCryptographicallyAuthenticated", "vibeVerifierExecutionAttested",
    "vibeProofClaimsIndependentlyVerified", "crossLanguageSemanticEquivalenceVerified",
    "phithonExecuted"]) {
    assert.equal(comparison.checks[flag], false);
  }
  assert.equal(comparison.canExecute, false);
  assert.equal(comparison.mayApproveModel, false);
  assert.equal(comparison.canPromoteLedgerAuthority, false);
  assert.equal((await verifyVibeProofCorrespondence(
    comparison, link, proofBrief(true), brief(), vibeSource, phiSource
  )).valid, true);
});

test("Vibe reported FAIL remains a reported failure, not a passing quality gate", async () => {
  const link = await linking();
  const result = await createVibeProofCorrespondence(
    link, proofBrief(false), brief(), vibeSource, phiSource
  );
  assert.equal(result.report.compilerPassReported, false);
  assert.equal(result.report.emissionBlockedReported, true);
  assert.equal(result.checks.crossLanguageSemanticEquivalenceVerified, false);
});

test("Vibe proof source hash must match the original Vibe contract on disk", async () => {
  const proof = proofBrief();
  proof.intent_summary.source_hash = "e".repeat(64);
  await assert.rejects(
    createVibeProofCorrespondence(await linking(), proof, brief(), vibeSource, phiSource),
    /proof source hash differs/
  );
});

test("changed PhiThon implementation, Vibe brief, or source invalidates correspondence", async () => {
  const link = await linking();
  const record = await createVibeProofCorrespondence(link, proofBrief(), brief(), vibeSource, phiSource);
  const wrongPhi = await verifyVibeProofCorrespondence(
    record, link, proofBrief(), brief(), vibeSource, "print(13)\n"
  );
  assert.equal(wrongPhi.valid, false);
  const wrongVibe = await verifyVibeProofCorrespondence(
    record, link, proofBrief(), brief(), vibeSource + "# changed\n", phiSource
  );
  assert.equal(wrongVibe.valid, false);
  const changedProof = proofBrief(false);
  assert.equal((await verifyVibeProofCorrespondence(
    record, link, changedProof, brief(), vibeSource, phiSource
  )).valid, false);
});

test("forged trust and added fields are rejected rather than silently promoted", async () => {
  const link = await linking();
  const record = await createVibeProofCorrespondence(link, proofBrief(), brief(), vibeSource, phiSource);
  for(const mutate of [
    x => { x.checks.crossLanguageSemanticEquivalenceVerified = true; },
    x => { x.canExecute = true; },
    x => { x.provenance = "SIGNED_AND_TRUSTED"; },
    x => { x.authorization = { model: "approved" }; },
    x => { x.report.compilerPassReported = false; }
  ]) {
    const copy = structuredClone(record); mutate(copy);
    assert.equal((await verifyVibeProofCorrespondence(
      copy, link, proofBrief(), brief(), vibeSource, phiSource
    )).valid, false);
  }
});

test("proof-brief validator refuses unknown versions, injected authority, and malformed counts", () => {
  const baseline = proofBrief();
  for(const mutate of [
    x => { x.brief_version = "phase-9.0"; },
    x => { x.execution_grant = true; },
    x => { x.result.verified = true; },
    x => { x.result.passed = "YES"; },
    x => { x.intent_summary.source_hash = "bad"; },
    x => { x.intent_summary.api_key = "PRIVATE"; },
    x => { x.preserve_constraint_summary.obligations_total = -1; },
    x => { x.preserve_constraint_summary.obligations_sample[0].status = 10; },
    x => { x.interchange_metadata.consumer_safe = "yes"; }
  ]) {
    const sample = structuredClone(baseline); mutate(sample);
    assert.throws(() => validateVibeProofBrief(sample), /PhiVibe proof:/);
  }
  assert.throws(() => inspectVibeProofBriefJson("{broken"), /invalid JSON/);
  assert.throws(() => inspectVibeProofBriefJson("x".repeat(65_537)), /64 KiB/);
});

test("brief import reports identity only, never includes raw obligation text or proof paths", () => {
  const proof = proofBrief(true);
  proof.proof_path = "/secret/location/owner.pem";
  proof.intent_summary.package_context = { custom_private_note: "SHOULD_STAY_PRIVATE" };
  const summary = inspectVibeProofBrief(proof);
  assert.doesNotMatch(JSON.stringify(summary), /owner.pem|SHOULD_STAY_PRIVATE/);
  assert.equal(summary.compilerPassReported, true);
});

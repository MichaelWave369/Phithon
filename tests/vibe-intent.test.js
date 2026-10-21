import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  VIBE_BRIEF_VERSION, VIBE_LINK_SCHEMA, inspectVibeBrief,
  inspectVibeBriefJson, createVibePhiLink, verifyVibePhiLink
} from "../src/bridge/vibe-intent.js";

const vibe = [
  "intent SampleBridge:",
  '  goal: "Generate a simple reproducible result."',
  "  inputs:",
  "    value: number",
  "  outputs:",
  "    answer: number",
  "",
  "preserve:",
  "  deterministic_contract_shape >= 1",
  "",
  "constraint:",
  "  stable outputs",
  "",
  "emit python",
  ""
].join("\n");
const phi = "fn double(x) { return x * 2 }\nprint(double(21))\n";
const hash = text => createHash("sha256").update(text, "utf8").digest("hex");
const brief = () => ({
  brief_version: VIBE_BRIEF_VERSION,
  source_path: "/a/private/workstation/project.vibe",
  source_sha256: hash(vibe),
  intent: {
    name: "SampleBridge",
    goal: "Generate a simple reproducible result.",
    inputs: [{name:"value",type:"number"}],
    outputs: [{name:"answer",type:"number"}]
  },
  preserve: ["deterministic_contract_shape >= 1"],
  constraints: ["stable outputs"],
  bridge: [],
  emit_target: "python",
  domain_profile: null,
  interchange_metadata: {
    source_kind: "vibe_spec",
    transformation_state: "raw_intent_contract"
  }
});

test("R9 inspects exact Vibe Phase 8.4 intent shape without exposing private path", () => {
  const result = inspectVibeBriefJson(JSON.stringify(brief()));
  assert.equal(result.intentName, "SampleBridge");
  assert.equal(result.preserveCount, 1);
  assert.equal(result.constraintCount, 1);
  assert.equal(result.state, "DECLARED_INTENT_UNVERIFIED");
  assert.equal(result.semanticEquivalenceVerified, false);
  assert.equal(result.sourceHashMatched, false);
  assert.doesNotMatch(JSON.stringify(result), /private\/workstation/);
});

test("R9 links exact Vibe source hash with PhiThon program and optional package modules", async () => {
  const modules = { mathkit: "export fn triple(x) { return x * 3 }" };
  const source = "import mathkit\nprint(mathkit_triple(7))";
  const link = await createVibePhiLink(brief(), vibe, source, modules);
  assert.equal(link.schema, VIBE_LINK_SCHEMA);
  assert.equal(link.vibe.sourceSha256, hash(vibe));
  assert.equal(link.phithon.sourceSha256, hash(source));
  assert.equal(link.phithon.moduleHashes.mathkit, hash(modules.mathkit));
  assert.equal(link.verification.vibeBriefSourceHashMatched, true);
  assert.equal(link.verification.phithonSyntaxAndDependencyGraphParsed, true);
  assert.equal(link.verification.semanticEquivalenceVerified, false);
  assert.equal(link.verification.intentPreservationProven, false);
  assert.equal(link.verification.vibeVerificationPerformed, false);
  assert.equal(link.verification.phithonExecuted, false);
  assert.equal(link.executionAuthorized, false);
  assert.equal((await verifyVibePhiLink(link, brief(), vibe, source, modules)).valid, true);
});

test("Changed Vibe source is rejected if it no longer matches brief hash", async () => {
  await assert.rejects(
    createVibePhiLink(brief(), vibe.replace("stable outputs", "unstable outputs"), phi),
    /source hash mismatch/
  );
});

test("Changed PhiThon source is detected against prior link", async () => {
  const link = await createVibePhiLink(brief(), vibe, phi);
  assert.equal((await verifyVibePhiLink(link, brief(), vibe, phi)).valid, true);
  assert.equal((await verifyVibePhiLink(link, brief(), vibe, phi.replace("21", "22"))).valid, false);
});

test("Changed packaged module source is detected against prior link", async () => {
  const modules = { kit: "export let number = 3" };
  const src = "import kit\nprint(kit_number)";
  const link = await createVibePhiLink(brief(), vibe, src, modules);
  assert.equal((await verifyVibePhiLink(link, brief(), vibe, src, {kit:"export let number = 4"})).valid, false);
});

test("Forged verification/proof and authority flags are refused on link check", async () => {
  const link = await createVibePhiLink(brief(), vibe, phi);
  for(const mutate of [
    x => {x.verification.semanticEquivalenceVerified = true;},
    x => {x.executionAuthorized = true;},
    x => {x.provenance = "PROVEN";},
    x => {x.vibe.intentName = "Forged";},
    x => {x.linkedProof = {passed:true};}
  ]) {
    const forged = structuredClone(link);
    mutate(forged);
    assert.equal((await verifyVibePhiLink(forged, brief(), vibe, phi)).valid, false);
  }
});

test("Validation rejects poisoned JSON, unknown versions, bad fields and huge payloads", () => {
  const good = brief();
  for(const mutate of [
    x => {x.brief_version = "phase-9.9.unreviewed";},
    x => {x.intent.provider_token = "secret";},
    x => {x.external_network_grant = true;},
    x => {x.source_sha256 = "12345";},
    x => {x.interchange_metadata.transformation_state = "EXECUTION_PROVEN";},
    x => {x.intent.inputs[0].type = 2;},
    x => {x.bridge.push({key:"x",value:"y",extra:"secret"});}
  ]) {
    const injected = structuredClone(good);
    mutate(injected);
    assert.throws(() => inspectVibeBrief(injected), /PhiVibe:/);
  }
  assert.throws(() => inspectVibeBriefJson("{broken"), /invalid JSON/);
  assert.throws(() => inspectVibeBriefJson("x".repeat(65_537)), /64 KiB/);
});

test("Vibe input is validated without running either Vibe or PhiThon programs", async () => {
  const loop = "while(true) {}\n";
  const link = await createVibePhiLink(brief(), vibe, loop);
  assert.equal(link.verification.phithonExecuted, false);
  assert.equal(link.verification.semanticEquivalenceVerified, false);
});

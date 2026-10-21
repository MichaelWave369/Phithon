import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createVibePhiLink } from "../src/bridge/vibe-intent.js";
import { createVibeProofCorrespondence } from "../src/bridge/vibe-proof.js";
import { runVibeBehaviorVectors } from "../src/bridge/vibe-behavior.js";
import { runVibePropertyPlan } from "../src/bridge/vibe-properties.js";
import {
  VIBE_OBLIGATION_BINDINGS_SCHEMA, VIBE_OBLIGATION_LEDGER_SCHEMA,
  validateVibeObligationBindings, parseVibeObligationBindingsJson,
  buildVibeObligationLedger
} from "../src/bridge/vibe-obligations.js";

const digest = x => createHash("sha256").update(x,"utf8").digest("hex");
const vibeSource = 'intent CheckDouble:\n  goal: "Double a number"\n  inputs:\n    n: number\n  outputs:\n    result: number\nemit python\n';
const phiSource = "fn evaluate(n) { return n * 2 }\n";
const brief = () => ({
  brief_version:"phase-8.4.intent-brief.v1",source_path:"operator/hidden.vibe",
  source_sha256:digest(vibeSource),
  intent:{name:"CheckDouble",goal:"Double a number",inputs:[{name:"n",type:"number"}],
    outputs:[{name:"result",type:"number"}]},
  preserve:[],constraints:[],bridge:[],emit_target:"python",domain_profile:null,
  interchange_metadata:{source_kind:"vibe_spec",transformation_state:"raw_intent_contract"}
});
const proofBrief = () => ({
  brief_version:"phase-8.4.proof-brief.v1",
  proof_path:"/operator/sensitive.proof.json",proof_artifact_version:"v1",
  source_path:"/operator/hidden.vibe",verification_backend:"heuristic",
  result:{passed:true,emission_blocked:false},
  intent_summary:{source_hash:digest(vibeSource),ir_hash:"b".repeat(64),
    emit_target:"python",package_context:{},domain_profile:null,self_hosting:{}},
  preserve_constraint_summary:{
    obligation_summary:{satisfied:3},
    obligations_sample:[
      {obligation_id:"preserve.double",category:"preserve",status:"satisfied",critical:true},
      {obligation_id:"constraint.safe",category:"constraint",status:"satisfied",critical:false}
    ],obligations_total:3
  },
  bridge_result:{bridge_score:0.9,verdict:"preserved",measurement_ratio:0.85,epsilon_metrics:{}},
  equivalence_drift_summary:{intent_equivalence_score:0.85,drift_score:0.15,
    intent_items_total:2,intent_items_missing:0,intent_items_unknown:0},
  interchange_metadata:{source_kind:"proof_artifact",consumer_safe:true,
    deterministic_projection:true,notes:["Derived from existing proof artifact fields."]}
});
const vectorManifest = () => ({
  schema:"phithon.vibe-behavior-vectors.v1",
  intentName:"CheckDouble",entryFunction:"evaluate",
  provenance:"OPERATOR_SELECTED_EXPECTATIONS_UNATTESTED",
  cases:[{id:"zero",inputs:[0],expectedOutput:"0"},
    {id:"one",inputs:[1],expectedOutput:"2"},
    {id:"two",inputs:[2],expectedOutput:"4"}]
});
const propertyPlan = () => ({
  schema:"phithon.vibe-property-plan.v1",intentName:"CheckDouble",entryFunction:"evaluate",
  provenance:"OPERATOR_DECLARED_PROPERTY_UNATTESTED",
  seed:369,minInput:-4,maxInput:4,samples:3,
  property:{kind:"affine",factor:2,offset:0}
});
const bindings = () => ({
  schema:VIBE_OBLIGATION_BINDINGS_SCHEMA,provenance:"OPERATOR_CHOSEN_ASSOCIATION_UNATTESTED",
  bindings:[{obligationId:"preserve.double",evidence:[
    {type:"behavior",caseId:"two"},{type:"property",sampleIndex:2}
  ]}]
});
async function setup() {
  const intentBrief=brief();
  const proof=proofBrief();
  const link=await createVibePhiLink(intentBrief,vibeSource,phiSource);
  const correspondence=await createVibeProofCorrespondence(link,proof,intentBrief,vibeSource,phiSource);
  const behaviorReport=await runVibeBehaviorVectors({
    link,intentBrief,vibeSource,phiSource,vectors:vectorManifest(),
    runner:async src => ({output:[String(JSON.parse(src.match(/evaluate\((\-?\d+)\)/)?.[1] ?? "0")*2)],steps:4})
  });
  const propertyReport=await runVibePropertyPlan({
    link,intentBrief,vibeSource,phiSource,plan:propertyPlan(),
    runner:async src => ({output:[String(JSON.parse(src.match(/evaluate\((\-?\d+)\)/)?.[1] ?? "0")*2)],steps:4})
  });
  return {link,intentBrief,proofBrief:proof,correspondence,vibeSource,phiSource,
    behaviorReport,propertyReport,bindings:bindings()};
}

test("R13 maps Vibe's SAMPLE of obligations to operator-selected R11 and R12 observations", async () => {
  const inputs=await setup();
  const ledger=await buildVibeObligationLedger(inputs);
  assert.equal(ledger.schema,VIBE_OBLIGATION_LEDGER_SCHEMA);
  assert.equal(ledger.obligationsTotalReported,3);
  assert.equal(ledger.obligationsInProofSample,2);
  assert.equal(ledger.obligationsOmittedFromProofSample,1);
  assert.equal(ledger.associatedSampledObligations,1);
  assert.equal(ledger.unresolvedSampledObligations,1);
  assert.equal(ledger.rows[0].associationStatus,"REPORTED_SAMPLE_MATCHES");
  assert.equal(ledger.rows[0].vibeReportedStatus,"satisfied");
  assert.equal(ledger.rows[0].vibeReportedCritical,true);
  assert.equal(ledger.rows[0].evidence.length,2);
  assert.equal(ledger.rows[1].associationStatus,"NO_ASSOCIATION");
  assert.equal(ledger.intentPreservationProven,false);
  assert.equal(ledger.crossLanguageEquivalenceVerified,false);
  assert.equal(ledger.reportsIndependentlyAuthenticated,false);
  assert.equal(ledger.semanticCoverageEstablished,false);
  assert.doesNotMatch(JSON.stringify(ledger),/sensitive\.proof\.json|operator\/hidden/);
  assert.doesNotMatch(JSON.stringify(ledger),/"inputs":\[/);
});

test("R13 preserves Vibe reported failure distinct from selected test match", async () => {
  const inp=await setup();
  inp.proofBrief.result.passed=false;
  inp.proofBrief.result.emission_blocked=true;
  inp.proofBrief.preserve_constraint_summary.obligations_sample[0].status="violated";
  inp.correspondence=await createVibeProofCorrespondence(
    inp.link,inp.proofBrief,inp.intentBrief,inp.vibeSource,inp.phiSource
  );
  const rows=(await buildVibeObligationLedger(inp)).rows;
  assert.equal(rows[0].vibeReportedStatus,"violated");
  assert.equal(rows[0].associationStatus,"REPORTED_SAMPLE_MATCHES");
});

test("R13 propagates reported mismatches and inconclusive evidence without proof promotion", async () => {
  const inp=await setup();
  inp.behaviorReport.cases[2].status="MISMATCH";
  inp.behaviorReport.matches=2;
  inp.behaviorReport.mismatches=1;
  inp.behaviorReport.outcome="SELECTED_CASES_NOT_ALL_MATCHED";
  let ledger=await buildVibeObligationLedger(inp);
  assert.equal(ledger.rows[0].associationStatus,"REPORTED_MISMATCH");
  inp.propertyReport.cases[1].status="INCONCLUSIVE";
  inp.propertyReport.matches=2;
  inp.propertyReport.inconclusive=1;
  inp.propertyReport.outcome="SAMPLED_CHECKS_NOT_ALL_MATCHED";
  ledger=await buildVibeObligationLedger(inp);
  assert.equal(ledger.rows[0].associationStatus,"INCOMPLETE_OR_ERROR");
});

test("R13 rejects stale link, forged proof source and altered source before reviewing evidence", async () => {
  const inp=await setup();
  inp.phiSource="fn evaluate(n) { return n * 3 }\n";
  await assert.rejects(buildVibeObligationLedger(inp),/source mismatch/);
  const fresh=await setup();
  fresh.proofBrief.intent_summary.source_hash="f".repeat(64);
  await assert.rejects(buildVibeObligationLedger(fresh),/source mismatch/);
});

test("R13 refuses evidence reports from unrelated programs or altered source links", async () => {
  for(const change of [
    inp=>{inp.behaviorReport.sourceLinkSha256="a".repeat(64);},
    inp=>{inp.propertyReport.vibeSourceSha256="b".repeat(64);},
    inp=>{inp.behaviorReport.moduleHashes={unknown:"a".repeat(64)};},
    inp=>{inp.propertyReport.intentName="DifferentIntent";},
    inp=>{inp.behaviorReport.cases[0].status="FAKE_PASS";},
    inp=>{inp.propertyReport.cases[0].observedSha256="NOT_A_HASH";},
    inp=>{inp.behaviorReport.cases[1].status="MISMATCH";},
    inp=>{inp.behaviorReport.semanticEquivalenceVerified=true;},
    inp=>{inp.propertyReport.modelRoutingApproved=true;}
  ]) {
    const inp=await setup();change(inp);
    await assert.rejects(buildVibeObligationLedger(inp),/PhiVibe obligations:/);
  }
});

test("R13 refuses unknown IDs, extra metadata, duplicate associations and nonexistent evidence", async () => {
  const inp=await setup();
  for(const change of [
    p=>{p.provenance="VERIFIED_COVERAGE";},
    p=>{p.executeRemote=true;},
    p=>{p.bindings[0].obligationId="unlisted";},
    p=>{p.bindings.push(structuredClone(p.bindings[0]));},
    p=>{p.bindings[0].evidence.push({type:"behavior",caseId:"two"});},
    p=>{p.bindings[0].evidence[0]={type:"property",sampleIndex:50};},
    p=>{p.bindings[0].evidence[0]={type:"script",command:"whoami"};}
  ]){
    const altered=structuredClone(inp.bindings);change(altered);
    if (altered.bindings[0]?.evidence[0]?.sampleIndex === 50) {
      // In-range validation rejects this before evidence lookup.
      assert.throws(()=>validateVibeObligationBindings(altered,inp.proofBrief),/PhiVibe obligations:/);
    } else {
      assert.throws(()=>validateVibeObligationBindings(altered,inp.proofBrief),/PhiVibe obligations:/);
    }
  }
  const changed={...inp,bindings:structuredClone(inp.bindings)};
  changed.bindings.bindings[0].evidence[0].caseId="missing";
  await assert.rejects(buildVibeObligationLedger(changed),/reference missing/);
});

test("R13 refuses ambiguous Vibe obligation sample IDs and duplicate upstream IDs", async () => {
  const inp=await setup();
  inp.proofBrief.preserve_constraint_summary.obligations_sample[0].obligation_id=null;
  assert.throws(()=>validateVibeObligationBindings(inp.bindings,inp.proofBrief),/ambiguous/);
  const second=await setup();
  second.proofBrief.preserve_constraint_summary.obligations_sample[1].obligation_id="preserve.double";
  assert.throws(()=>validateVibeObligationBindings(second.bindings,second.proofBrief),/ambiguous/);
});

test("R13 parsing refuses oversized payload, malformed data and accepts empty mapping as unknown coverage", async () => {
  const inp=await setup();
  const empty={...bindings(),bindings:[]};
  assert.equal(parseVibeObligationBindingsJson(JSON.stringify(empty),inp.proofBrief),empty.schema&&empty);
  const ledger=await buildVibeObligationLedger({...inp,bindings:empty});
  assert.equal(ledger.associatedSampledObligations,0);
  assert.equal(ledger.unresolvedSampledObligations,2);
  assert.throws(()=>parseVibeObligationBindingsJson("{broken",inp.proofBrief),/invalid JSON/);
  assert.throws(()=>parseVibeObligationBindingsJson("x".repeat(8193),inp.proofBrief),/8 KiB/);
});

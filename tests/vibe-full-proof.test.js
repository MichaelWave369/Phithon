import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createVibePhiLink } from "../src/bridge/vibe-intent.js";
import { createVibeProofCorrespondence } from "../src/bridge/vibe-proof.js";
import { runVibeBehaviorVectors } from "../src/bridge/vibe-behavior.js";
import { runVibePropertyPlan } from "../src/bridge/vibe-properties.js";
import {
  extractFullVibeObligations,parseFullVibeProofJson,buildFullVibeObligationLedger,
  VIBE_FULL_LEDGER_SCHEMA
} from "../src/bridge/vibe-full-proof.js";

const hash=s=>createHash("sha256").update(s,"utf8").digest("hex");
const vibeSource='intent Inventory:\n  goal: "A test"\n  inputs:\n    x: number\n  outputs:\n    y: number\nemit python\n';
const phiSource="fn evaluate(x) { return x * 2 }\n";
const intentBrief=()=>({
  brief_version:"phase-8.4.intent-brief.v1",source_path:"secret/source.vibe",
  source_sha256:hash(vibeSource),
  intent:{name:"Inventory",goal:"A test",inputs:[{name:"x",type:"number"}],outputs:[{name:"y",type:"number"}]},
  preserve:[],constraints:[],bridge:[],emit_target:"python",domain_profile:null,
  interchange_metadata:{source_kind:"vibe_spec",transformation_state:"raw_intent_contract"}
});
const obligations=()=>Array.from({length:12},(_,i)=>({
  obligation_id:"preserve."+(i+1),category:"preserve",
  description:"Private check "+i,
  source_location:"/home/operator/private.vibe:"+i,
  status:i===11?"unknown":"satisfied",evidence:"private observation",
  critical:i===10
}));
const fullProof=()=>({
  schema_version:"v1",artifact_version:"v1",source_hash:hash(vibeSource),
  ir_hash:"a".repeat(64),emit_target:"python",verification_backend:"heuristic",
  result:{passed:true,emission_blocked:false},obligations:obligations(),
  package_context:{secretKey:"never export"}
});
const proofBrief=()=>{
  const p=fullProof();
  return {
    brief_version:"phase-8.4.proof-brief.v1",proof_path:"/operator/secret.vibe.proof.json",
    proof_artifact_version:"v1",source_path:"/operator/private.vibe",
    verification_backend:p.verification_backend,result:{...p.result},
    intent_summary:{source_hash:p.source_hash,ir_hash:p.ir_hash,
      emit_target:p.emit_target,package_context:{},domain_profile:null,self_hosting:{}},
    preserve_constraint_summary:{obligation_summary:{satisfied:11,unknown:1},
      obligations_sample:p.obligations.slice(0,10).map(r=>({
        obligation_id:r.obligation_id,category:r.category,status:r.status,critical:r.critical
      })),obligations_total:p.obligations.length},
    bridge_result:{bridge_score:0.9,verdict:"preserved",measurement_ratio:0.82,epsilon_metrics:{}},
    equivalence_drift_summary:{intent_equivalence_score:0.91,drift_score:0.09,
      intent_items_total:2,intent_items_missing:0,intent_items_unknown:0},
    interchange_metadata:{source_kind:"proof_artifact",consumer_safe:true,deterministic_projection:true,
      notes:["Derived from existing proof artifact fields."]}
  };
};
async function setup() {
  const intent=intentBrief(),brief=proofBrief(),source=fullProof();
  const link=await createVibePhiLink(intent,vibeSource,phiSource);
  const correspondence=await createVibeProofCorrespondence(link,brief,intent,vibeSource,phiSource);
  const runner=async source=>{
    const match=source.match(/evaluate\((-?\d+)\)/);
    return {output:[String(Number(match?.[1]??"0")*2)],steps:3};
  };
  const behaviorReport=await runVibeBehaviorVectors({
    link,intentBrief:intent,vibeSource,phiSource,
    vectors:{schema:"phithon.vibe-behavior-vectors.v1",intentName:"Inventory",
      entryFunction:"evaluate",provenance:"OPERATOR_SELECTED_EXPECTATIONS_UNATTESTED",
      cases:[{id:"two",inputs:[2],expectedOutput:"4"}]},
    runner
  });
  const propertyReport=await runVibePropertyPlan({
    link,intentBrief:intent,vibeSource,phiSource,
    plan:{schema:"phithon.vibe-property-plan.v1",intentName:"Inventory",
      entryFunction:"evaluate",provenance:"OPERATOR_DECLARED_PROPERTY_UNATTESTED",
      seed:369,minInput:-3,maxInput:3,samples:3,
      property:{kind:"affine",factor:2,offset:0}},
    runner
  });
  return {fullProof:source,link,intentBrief:intent,proofBrief:brief,
    correspondence,vibeSource,phiSource,behaviorReport,propertyReport,
    bindings:{schema:"phithon.vibe-obligation-bindings.v1",
      provenance:"OPERATOR_CHOSEN_ASSOCIATION_UNATTESTED",
      bindings:[{obligationId:"preserve.12",evidence:[{type:"behavior",caseId:"two"}]}]}
  };
}
test("R14 reads ALL 12 upstream obligations, not merely the first ten",()=>{
  const rows=extractFullVibeObligations(fullProof(),proofBrief());
  assert.equal(rows.length,12);
  assert.equal(rows[11].obligation_id,"preserve.12");
  assert.equal(rows[10].critical,true);
  assert.ok(!("description" in rows[0]));
  assert.ok(!("source_location" in rows[0]));
  assert.equal(parseFullVibeProofJson(JSON.stringify(fullProof()),proofBrief()).length,12);
});
test("R14 full mapping supports an obligation beyond Vibe brief's ten samples",async()=>{
  const input=await setup();
  const result=await buildFullVibeObligationLedger(input);
  assert.equal(result.schema,VIBE_FULL_LEDGER_SCHEMA);
  assert.equal(result.obligationsTotalReported,12);
  assert.equal(result.obligationsInFullArtifact,12);
  assert.equal(result.obligationsInCompactBrief,10);
  assert.equal(result.obligationsMissingFromFullArtifact,0);
  assert.equal(result.associatedSampledObligations,1);
  assert.equal(result.rows[11].obligationId,"preserve.12");
  assert.equal(result.rows[11].associationStatus,"REPORTED_SAMPLE_MATCHES");
  assert.equal(result.rows[0].associationStatus,"NO_ASSOCIATION");
  assert.equal(result.fullInventoryAuthenticated,false);
  assert.equal(result.intentPreservationProven,false);
  assert.equal(result.crossLanguageEquivalenceVerified,false);
  assert.doesNotMatch(JSON.stringify(result),/never export|Private check|private.vibe|private observation/);
});
test("R14 rejects altered first-ten compact projection and count mismatches",()=>{
  const altered=proofBrief();
  altered.preserve_constraint_summary.obligations_sample[2].status="violated";
  assert.throws(()=>extractFullVibeObligations(fullProof(),altered),/first-ten/);
  const count=proofBrief();count.preserve_constraint_summary.obligations_total=13;
  assert.throws(()=>extractFullVibeObligations(fullProof(),count),/count differs/);
  const reordered=fullProof();
  [reordered.obligations[0],reordered.obligations[1]]=[
    reordered.obligations[1],reordered.obligations[0]
  ];
  assert.throws(()=>extractFullVibeObligations(reordered,proofBrief()),/first-ten/);
});
test("R14 detects original proof source/IR/backend/result mismatch",()=>{
  for(const change of [
    x=>{x.source_hash="b".repeat(64);},x=>{x.ir_hash="b".repeat(64);},
    x=>{x.schema_version="v2";},x=>{x.artifact_version="v0";},
    x=>{x.verification_backend="faked";},x=>{x.emit_target="rust";},
    x=>{x.result.passed=false;}
  ]) {
    const sample=fullProof();change(sample);
    assert.throws(()=>extractFullVibeObligations(sample,proofBrief()),/provenance|result/);
  }
});
test("R14 rejects duplicate/null ID and malformed obligation fields",()=>{
  for(const change of [
    x=>{x.obligations[11].obligation_id="preserve.10";},
    x=>{x.obligations[0].obligation_id=null;},
    x=>{x.obligations[0].evidence={secret:"injected"};},
    x=>{x.obligations[0].source_location=3;},
    x=>{x.obligations[0].critical="true";},
    x=>{x.obligations[0].executeNetwork=true;},
    x=>{x.obligations[0].status="error\ninjected";}
  ]) {
    const sample=fullProof();change(sample);
    assert.throws(()=>extractFullVibeObligations(sample,proofBrief()),/ambiguous|unsafe|unexpected/);
  }
});
test("R14 refuses tampered linked .phi source and previous evidence",async()=>{
  const sample=await setup();
  sample.phiSource="fn evaluate(x) { return x * 3 }\n";
  await assert.rejects(buildFullVibeObligationLedger(sample),/source mismatch/);
  const fresh=await setup();
  fresh.propertyReport.sourceLinkSha256="c".repeat(64);
  await assert.rejects(buildFullVibeObligationLedger(fresh),/source link/);
});
test("R14 bounds JSON bytes and 512 obligations, retains zero-obligation inventory",()=>{
  assert.throws(()=>parseFullVibeProofJson("{broken",proofBrief()),/invalid JSON/);
  assert.throws(()=>parseFullVibeProofJson(" ".repeat(2097153),proofBrief()),/2 MiB/);
  const large=fullProof();
  large.obligations=Array.from({length:513},(_,i)=>({
    ...obligations()[0],obligation_id:"preserve."+(i+1)
  }));
  assert.throws(()=>extractFullVibeObligations(large,proofBrief()),/512|count/);
  const empty=fullProof(),brief=proofBrief();
  empty.obligations=[];
  brief.preserve_constraint_summary.obligations_total=0;
  brief.preserve_constraint_summary.obligations_sample=[];
  assert.deepEqual(extractFullVibeObligations(empty,brief),[]);
});

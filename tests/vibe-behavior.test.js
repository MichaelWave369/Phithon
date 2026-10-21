import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createVibePhiLink } from "../src/bridge/vibe-intent.js";
import {
  VIBE_VECTORS_SCHEMA, VIBE_BEHAVIOR_REPORT_SCHEMA,
  validateVibeVectors, parseVibeVectorsJson, runVibeBehaviorVectors
} from "../src/bridge/vibe-behavior.js";

const vibeSource = [
  "intent PhiDouble:",
  '  goal: "Double a bounded number deterministically."',
  "  inputs:",
  "    x: number",
  "  outputs:",
  "    doubled: number",
  "emit python", ""
].join("\n");
const phiSource = "fn evaluate(x) { return x * 2 }\n";
const digest = x => createHash("sha256").update(x, "utf8").digest("hex");
const brief = () => ({
  brief_version:"phase-8.4.intent-brief.v1",
  source_path:"/operator/private/contract.vibe",
  source_sha256:digest(vibeSource),
  intent:{name:"PhiDouble",goal:"Double a bounded number deterministically.",inputs:[{name:"x",type:"number"}],outputs:[{name:"doubled",type:"number"}]},
  preserve:[],constraints:[],bridge:[],emit_target:"python",domain_profile:null,
  interchange_metadata:{source_kind:"vibe_spec",transformation_state:"raw_intent_contract"}
});
const vectors = () => ({
  schema:VIBE_VECTORS_SCHEMA,intentName:"PhiDouble",entryFunction:"evaluate",
  provenance:"OPERATOR_SELECTED_EXPECTATIONS_UNATTESTED",
  cases:[
    {id:"zero",inputs:[0],expectedOutput:"0"},
    {id:"positive",inputs:[21],expectedOutput:"42"},
    {id:"negative",inputs:[-3],expectedOutput:"-6"}
  ]
});
const link = async (source=phiSource, modules={}) => createVibePhiLink(brief(), vibeSource, source, modules);

test("R11 selected numeric PhiThon behavior executes with real PhiShield and records only hashes", async () => {
  const record = await runVibeBehaviorVectors({
    link:await link(), intentBrief:brief(), vibeSource, phiSource, vectors:vectors()
  });
  assert.equal(record.schema,VIBE_BEHAVIOR_REPORT_SCHEMA);
  assert.equal(record.caseCount,3);
  assert.equal(record.matches,3);
  assert.equal(record.mismatches,0);
  assert.equal(record.errors,0);
  assert.equal(record.outcome,"ALL_SELECTED_CASES_MATCH");
  assert.equal(record.cases.every(row=>row.status==="MATCH"),true);
  assert.equal(record.cases[1].observedOutputSha256,digest("42"));
  assert.equal(record.intentPreservationProven,false);
  assert.equal(record.semanticEquivalenceVerified,false);
  assert.equal(record.exhaustiveCoverageProven,false);
  assert.equal(record.vibeVerifierRun,false);
  assert.equal(record.modelRoutingApproved,false);
  const redacted=JSON.stringify(record);
  assert.doesNotMatch(redacted,/operator\/private/);
  assert.doesNotMatch(redacted,/"inputs":\[/);
});

test("R11 incorrect expected output results in MISMATCH not false PASS", async () => {
  const v=vectors(); v.cases[1].expectedOutput="84";
  const report=await runVibeBehaviorVectors({link:await link(),intentBrief:brief(),vibeSource,phiSource,vectors:v});
  assert.equal(report.matches,2);
  assert.equal(report.mismatches,1);
  assert.equal(report.outcome,"SELECTED_CASES_NOT_ALL_MATCHED");
  assert.equal(report.cases[1].status,"MISMATCH");
  assert.equal(report.cases[1].observedOutputSha256,digest("42"));
});

test("R11 runtime output pollution is detected rather than silently ignored", async () => {
  const source = 'print("extra")\nfn evaluate(x) { return x * 2 }\n';
  const report=await runVibeBehaviorVectors({
    link:await link(source),intentBrief:brief(),vibeSource,phiSource:source,
    vectors:{...vectors(),cases:[{id:"one",inputs:[1],expectedOutput:"2"}]}
  });
  assert.equal(report.mismatches,1);
  assert.equal(report.cases[0].outputLineCount,2);
  assert.equal(report.cases[0].observedOutputSha256,null);
});

test("R11 individual child runtime error is recorded as ERROR, not a PASS", async () => {
  const record=await runVibeBehaviorVectors({
    link:await link(),intentBrief:brief(),vibeSource,phiSource,
    vectors:{...vectors(),cases:[{id:"one",inputs:[2],expectedOutput:"4"}]},
    runner:async()=>{throw new Error("secret credential: do not log");}
  });
  assert.equal(record.errors,1);
  assert.equal(record.outcome,"SELECTED_CASES_NOT_ALL_MATCHED");
  assert.equal(record.cases[0].status,"ERROR");
  assert.equal(record.cases[0].errorClass,"EXECUTION_ERROR_OR_TIMEOUT");
  assert.doesNotMatch(JSON.stringify(record),/secret credential/);
});

test("R11 refuses stale R9 link even if expectation coincidentally still holds", async () => {
  await assert.rejects(runVibeBehaviorVectors({
    link:await link(),intentBrief:brief(),vibeSource,phiSource:"fn evaluate(x) { return x + x }\n",vectors:vectors()
  }),/R9 source link mismatch/);
});

test("R11 requires a real top-level function and exact Vibe argument count", async () => {
  const src="fn someOtherName(x) { return x * 2 }\n";
  await assert.rejects(runVibeBehaviorVectors({
    link:await link(src),intentBrief:brief(),vibeSource,phiSource:src,vectors:vectors()
  }),/entryFunction must name/);
  const wrong="fn evaluate(x, y) { return x * y }\n";
  await assert.rejects(runVibeBehaviorVectors({
    link:await link(wrong),intentBrief:brief(),vibeSource,phiSource:wrong,vectors:vectors()
  }),/entryFunction must name/);
});

test("R11 rejects injected fields, wrong types, duplicate IDs and unreviewed expectation markers", () => {
  const baseline=vectors();
  for(const mutate of [
    x=>{x.entryFunction="ledger";},
    x=>{x.entryFunction="evaluate(); ledger";},
    x=>{x.provenance="VERIFIED_BEHAVIOR";},
    x=>{x.authorize_network=true;},
    x=>{x.cases[0].id="Other";},
    x=>{x.cases[1].id="zero";},
    x=>{x.cases[1].inputs=["21"];},
    x=>{x.cases[1].inputs=[Infinity];},
    x=>{x.cases[1].inputs=[10000000];},
    x=>{x.cases[0].expectedOutput={evil:true};},
    x=>{x.cases[0].expectedOutput="a".repeat(257);},
    x=>{x.cases[0].expectedTruth="CERTIFIED";}
  ]){
    const changed=structuredClone(baseline);
    mutate(changed);
    assert.throws(()=>validateVibeVectors(changed,brief()),/PhiVibe vectors:/);
  }
  assert.throws(()=>parseVibeVectorsJson("{bad",brief()),/invalid JSON/);
  assert.throws(()=>parseVibeVectorsJson("x".repeat(24577),brief()),/24 KiB/);
});

test("R11 refuses case arity mismatches, unsupported Vibe field types and unlinked intent names", () => {
  const wrong=vectors();wrong.intentName="Other";
  assert.throws(()=>validateVibeVectors(wrong,brief()),/intent name mismatch/);
  const bad=vectors();bad.cases[0].inputs=[];
  assert.throws(()=>validateVibeVectors(bad,brief()),/arity/);
  const unusual=brief();unusual.intent.inputs[0].type="object";
  assert.throws(()=>validateVibeVectors(vectors(),unusual),/unsupported/);
});

test("R11 honors PhiPack source hashes, no implicit model grants", async () => {
  const modules={foo:"export let n = 2"};
  const source="import foo\nfn evaluate(x) { return x * foo_n }\n";
  const record=await runVibeBehaviorVectors({
    link:await link(source,modules),intentBrief:brief(),vibeSource,phiSource:source,modules,
    vectors:{...vectors(),cases:[{id:"two",inputs:[2],expectedOutput:"4"}]}
  });
  assert.equal(record.matches,1);
  assert.equal(record.moduleHashes.foo,digest(modules.foo));
  await assert.rejects(runVibeBehaviorVectors({
    link:await link(source,modules),intentBrief:brief(),vibeSource,phiSource:source,
    modules:{foo:"export let n = 3"},vectors:vectors()
  }),/source link mismatch/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createVibePhiLink } from "../src/bridge/vibe-intent.js";
import {
  VIBE_PROPERTIES_SCHEMA, VIBE_PROPERTY_REPORT_SCHEMA,
  generateVibePropertySamples, validateVibePropertyPlan,
  parseVibePropertyPlanJson, runVibePropertyPlan
} from "../src/bridge/vibe-properties.js";

const hash = x => createHash("sha256").update(x, "utf8").digest("hex");
const vibeSource = [
  "intent PropertyDemo:",
  '  goal: "Produce bounded numeric output."',
  "  inputs:",
  "    x: number",
  "  outputs:",
  "    y: number",
  "emit python", ""
].join("\n");
const phiSource = "fn evaluate(x) { return x * 2 }\n";
const brief = () => ({
  brief_version:"phase-8.4.intent-brief.v1",source_path:"operator/private/contract.vibe",
  source_sha256:hash(vibeSource),
  intent:{name:"PropertyDemo",goal:"Produce bounded numeric output.",
    inputs:[{name:"x",type:"number"}],outputs:[{name:"y",type:"number"}]},
  preserve:[],constraints:[],bridge:[],emit_target:"python",domain_profile:null,
  interchange_metadata:{source_kind:"vibe_spec",transformation_state:"raw_intent_contract"}
});
const plan = (property={kind:"affine",factor:2,offset:0}) => ({
  schema:VIBE_PROPERTIES_SCHEMA,intentName:"PropertyDemo",
  entryFunction:"evaluate",provenance:"OPERATOR_DECLARED_PROPERTY_UNATTESTED",
  seed:369,minInput:-10,maxInput:10,samples:5,property
});
const link = async (src=phiSource,modules={}) => createVibePhiLink(brief(),vibeSource,src,modules);

test("R12 fixed seed generates stable, sorted, unique boundary-aware samples", () => {
  const a=generateVibePropertySamples(plan(),brief());
  const b=generateVibePropertySamples(plan(),brief());
  assert.deepEqual(a,b);
  assert.equal(a.length,5);
  assert.deepEqual(a.slice().sort((x,y)=>x-y),a);
  assert.equal(new Set(a).size,a.length);
  assert.equal(a[0],-10);
  assert.equal(a.at(-1),10);
  assert.ok(a.includes(0));
});

test("R12 real bounded PhiShield executions match operator-declared affine property", async () => {
  const report=await runVibePropertyPlan({
    link:await link(),intentBrief:brief(),vibeSource,phiSource,plan:plan()
  });
  assert.equal(report.schema,VIBE_PROPERTY_REPORT_SCHEMA);
  assert.equal(report.sampleCount,5);
  assert.equal(report.matches,5);
  assert.equal(report.mismatches,0);
  assert.equal(report.errors,0);
  assert.equal(report.outcome,"ALL_SAMPLED_CHECKS_MATCH");
  assert.equal(report.crossLanguageSemanticEquivalenceVerified,false);
  assert.equal(report.exhaustiveCoverageProven,false);
  assert.equal(report.vibePreservationProven,false);
  assert.equal(report.vibeVerifierInvoked,false);
  assert.equal(report.modelRoutingApproved,false);
  assert.equal(report.cases.every(x=>x.status==="MATCH"),true);
  assert.doesNotMatch(JSON.stringify(report),/operator\/private|observedValue|expectedOutput/);
  assert.match(report.planSha256,/^[a-f0-9]{64}$/);
});

test("R12 wrong operator affine rule produces a mismatch and never an assertion of proof", async () => {
  const report=await runVibePropertyPlan({
    link:await link(),intentBrief:brief(),vibeSource,phiSource,
    plan:plan({kind:"affine",factor:3,offset:0})
  });
  assert.ok(report.mismatches>=1);
  assert.equal(report.outcome,"SAMPLED_CHECKS_NOT_ALL_MATCHED");
  assert.equal(report.vibePreservationProven,false);
});

test("R12 nonnegative properties are evaluated on numeric outputs", async () => {
  const source="fn evaluate(x) { return x * x }\n";
  const report=await runVibePropertyPlan({
    link:await link(source),intentBrief:brief(),vibeSource,phiSource:source,
    plan:plan({kind:"nonnegative"})
  });
  assert.equal(report.matches,5);
  assert.equal(report.errors,0);
});

test("R12 monotonicity checks adjacent sorted outputs, including detecting a decrease", async () => {
  const report=await runVibePropertyPlan({
    link:await link(),intentBrief:brief(),vibeSource,phiSource,
    plan:plan({kind:"monotonic_nondecreasing"})
  });
  assert.equal(report.matches,5);
  const decreasing="fn evaluate(x) { return 0 - x }\n";
  const failed=await runVibePropertyPlan({
    link:await link(decreasing),intentBrief:brief(),vibeSource,phiSource:decreasing,
    plan:plan({kind:"monotonic_nondecreasing"})
  });
  assert.ok(failed.mismatches>0);
});

test("R12 repeatability reruns each input in a separate child, allowing mismatch", async () => {
  let calls=0;
  const observed=await runVibePropertyPlan({
    link:await link(),intentBrief:brief(),vibeSource,phiSource,
    plan:plan({kind:"repeatable"}),
    runner:async()=>({output:[String(++calls)],steps:2})
  });
  assert.equal(calls,10);
  assert.equal(observed.mismatches,5);
  assert.equal(observed.errors,0);
  assert.equal(observed.cases.every(x=>x.repeatObservedSha256),true);
});

test("R12 errors and malformed runner output cannot silently count as matches", async () => {
  let n=0;
  const report=await runVibePropertyPlan({
    link:await link(),intentBrief:brief(),vibeSource,phiSource,plan:plan(),
    runner:async()=>{
      n++;
      if(n===1) throw new Error("private key content MUST NOT leak");
      if(n===2) return {output:["NaN"],steps:10};
      if(n===3) return {output:["3","4"],steps:10};
      return {output:["0"],steps:10};
    }
  });
  assert.equal(report.errors,3);
  assert.equal(report.outcome,"SAMPLED_CHECKS_NOT_ALL_MATCHED");
  assert.doesNotMatch(JSON.stringify(report),/private key content/);
});

test("R12 stale source link refused before any property evaluation", async () => {
  let calls=0;
  await assert.rejects(runVibePropertyPlan({
    link:await link(),intentBrief:brief(),vibeSource,
    phiSource:"fn evaluate(x) { return x * 3 }\n",plan:plan(),
    runner:async()=>{ calls++;return {output:["1"],steps:3};}
  }),/source link mismatch/);
  assert.equal(calls,0);
});

test("R12 enforces a real top-level unary function, rejecting builtins and arity mismatches", async () => {
  const source="fn other(x) { return x * 2 }\n";
  await assert.rejects(runVibePropertyPlan({
    link:await link(source),intentBrief:brief(),vibeSource,phiSource:source,
    plan:plan()
  }),/top-level unary/);
  const wrong="fn evaluate(x,y) { return x + y }\n";
  await assert.rejects(runVibePropertyPlan({
    link:await link(wrong),intentBrief:brief(),vibeSource,phiSource:wrong,
    plan:plan()
  }),/top-level unary/);
});

test("R12 fail-closes on unknown property kinds, malicious fields, invalid seeds and domains", () => {
  for(const mutate of [
    x=>{x.schema="false-proof";},
    x=>{x.provenance="INDEPENDENTLY_VERIFIED";},
    x=>{x.intentName="NotThisIntent";},
    x=>{x.entryFunction="print";},
    x=>{x.entryFunction="eval(1); send";},
    x=>{x.property={kind:"execute_shell"};},
    x=>{x.property={kind:"affine",factor:2,offset:0,apiKey:"secret"};},
    x=>{x.property={kind:"affine",factor:Infinity,offset:0};},
    x=>{x.property={kind:"nonnegative",url:"https://evil.example"};},
    x=>{x.seed=0;},
    x=>{x.seed=-1;},
    x=>{x.seed=0x1_0000_0000;},
    x=>{x.minInput=20;x.maxInput=10;},
    x=>{x.minInput=-2000;},
    x=>{x.maxInput=2000;},
    x=>{x.samples=13;},
    x=>{x.samples=2;},
    x=>{x.minInput=1;x.maxInput=2;},
    x=>{x.authorize_network=true;}
  ]){
    const changed=structuredClone(plan());
    mutate(changed);
    assert.throws(()=>validateVibePropertyPlan(changed,brief()),/PhiVibe properties:/);
  }
  assert.throws(()=>parseVibePropertyPlanJson("{malformed",brief()),/malformed JSON/);
  assert.throws(()=>parseVibePropertyPlanJson("x".repeat(16_385),brief()),/16 KiB/);
});

test("R12 rejects unsupported Vibe declarations and supports independent module hashes", async () => {
  const typed=brief();typed.intent.inputs[0].type="string";
  assert.throws(()=>validateVibePropertyPlan(plan(),typed),/one numeric Vibe input/);
  const modules={mathkit:"export let f = 2"};
  const source="import mathkit\nfn evaluate(x) { return x * mathkit_f }\n";
  const report=await runVibePropertyPlan({
    link:await link(source,modules),intentBrief:brief(),vibeSource,
    phiSource:source,modules,plan:plan()
  });
  assert.equal(report.matches,5);
  assert.equal(report.moduleHashes.mathkit,hash(modules.mathkit));
  await assert.rejects(runVibePropertyPlan({
    link:await link(source,modules),intentBrief:brief(),vibeSource,
    phiSource:source,modules:{mathkit:"export let f = 3"},plan:plan()
  }),/source link mismatch/);
});

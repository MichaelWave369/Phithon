import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli=resolve("src/cli.js"), fixture=resolve("examples/vibe-behavior");
const hash=x=>createHash("sha256").update(x,"utf8").digest("hex");
const run=args=>execFileSync(process.execPath,[cli,...args],{
  encoding:"utf8",timeout:35000,stdio:["ignore","pipe","pipe"]
});
async function prepare(root){
  const p={};
  for(const key of ["vibe","phi","intent","full","brief","link","correspondence",
    "vectors","propertyPlan","behavior","propertyReport","bindings","out"]){
    p[key]=join(root,key+".json");
  }
  p.vibe=join(root,"contract.vibe");
  p.phi=join(root,"implementation.phi");
  const vibeSource=await readFile(join(fixture,"contract.vibe"),"utf8");
  const phiSource=await readFile(join(fixture,"implementation.phi"),"utf8");
  await writeFile(p.vibe,vibeSource);
  await writeFile(p.phi,phiSource);
  await writeFile(p.vectors,await readFile(join(fixture,"vectors.json"),"utf8"));
  await writeFile(p.propertyPlan,await readFile(join(fixture,"properties.json"),"utf8"));
  const intent={
    brief_version:"phase-8.4.intent-brief.v1",source_path:"PRIVATE/contract.vibe",
    source_sha256:hash(vibeSource),
    intent:{name:"PhiDouble",goal:"Double one input number deterministically.",
      inputs:[{name:"x",type:"number"}],outputs:[{name:"doubled",type:"number"}]},
    preserve:["deterministic_contract_shape >= 1"],
    constraints:["no network side effects"],bridge:[],emit_target:"python",domain_profile:null,
    interchange_metadata:{source_kind:"vibe_spec",transformation_state:"raw_intent_contract"}
  };
  const obligations=Array.from({length:12},(_,i)=>({
    obligation_id:"constraint."+(i+1),category:"constraint",
    description:"secret requirement "+(i+1),source_location:"private/field.vibe:"+i,
    status:"satisfied",evidence:null,critical:i===11
  }));
  const full={
    artifact_version:"v1",schema_version:"v1",
    source_path:"PRIVATE/contract.vibe",source_hash:hash(vibeSource),
    ir_hash:"b".repeat(64),verification_backend:"heuristic",
    emit_target:"python",result:{passed:true,emission_blocked:false},
    obligations,notes:["private internal metadata"]
  };
  const brief={
    brief_version:"phase-8.4.proof-brief.v1",proof_path:"PRIVATE/proof.json",
    proof_artifact_version:"v1",source_path:"PRIVATE/contract.vibe",
    verification_backend:"heuristic",result:{...full.result},
    intent_summary:{source_hash:full.source_hash,ir_hash:full.ir_hash,
      emit_target:"python",package_context:{},domain_profile:null,self_hosting:{}},
    preserve_constraint_summary:{
      obligation_summary:{satisfied:12},
      obligations_sample:obligations.slice(0,10).map(x=>({
        obligation_id:x.obligation_id,category:x.category,status:x.status,critical:x.critical
      })),obligations_total:12
    },
    bridge_result:{bridge_score:0.9,verdict:"preserved",measurement_ratio:0.8,epsilon_metrics:{}},
    equivalence_drift_summary:{intent_equivalence_score:0.9,drift_score:0.1,
      intent_items_total:2,intent_items_missing:0,intent_items_unknown:0},
    interchange_metadata:{source_kind:"proof_artifact",consumer_safe:true,
      deterministic_projection:true,notes:["Derived from existing proof artifact fields."]}
  };
  const binding={
    schema:"phithon.vibe-obligation-bindings.v1",
    provenance:"OPERATOR_CHOSEN_ASSOCIATION_UNATTESTED",
    bindings:[{obligationId:"constraint.12",evidence:[
      {type:"behavior",caseId:"positive"},{type:"property",sampleIndex:1}
    ]}]
  };
  for(const [name,value] of [["intent",intent],["full",full],["brief",brief],
    ["bindings",binding]])await writeFile(p[name],JSON.stringify(value),"utf8");
  run(["vibe-link",p.intent,p.vibe,p.phi,"--out",p.link]);
  run(["vibe-proof-link",p.link,p.brief,p.intent,p.vibe,p.phi,"--out",p.correspondence]);
  run(["vibe-behavior",p.link,p.intent,p.vibe,p.phi,p.vectors,"--out",p.behavior]);
  run(["vibe-properties",p.link,p.intent,p.vibe,p.phi,p.propertyPlan,"--out",p.propertyReport]);
  return p;
}
const cliArgs=p=>["vibe-full-obligations",p.full,p.brief,p.correspondence,p.link,
  p.intent,p.vibe,p.phi,p.behavior,p.propertyReport,p.bindings,"--out",p.out];

test("R14 end-to-end CLI maps original proof obligation #12 to real R11/R12 child output",async()=>{
  const root=await mkdtemp(join(tmpdir(),"phithon-full-proof-"));
  try{
    const p=await prepare(root);
    const stdout=run(cliArgs(p));
    assert.match(stdout,/COMPLETE UNATTESTED INVENTORY/);
    assert.match(stdout,/Original proof obligations: 12 brief sample: 10/);
    const output=JSON.parse(await readFile(p.out,"utf8"));
    assert.equal(output.schema,"phithon.vibe-full-obligation-evidence.v1");
    assert.equal(output.obligationsInFullArtifact,12);
    assert.equal(output.rows.length,12);
    assert.equal(output.rows[11].obligationId,"constraint.12");
    assert.equal(output.rows[11].associationStatus,"REPORTED_SAMPLE_MATCHES");
    assert.equal(output.fullInventoryAuthenticated,false);
    assert.equal(output.intentPreservationProven,false);
    assert.doesNotMatch(JSON.stringify(output),/secret requirement|PRIVATE\/|private\/field.vibe/);
    assert.throws(()=>run(cliArgs(p)),/Command failed/); // cannot overwrite
  }finally{await rm(root,{recursive:true,force:true});}
});
test("R14 CLI refuses altered original proof before creating any ledger",async()=>{
  const root=await mkdtemp(join(tmpdir(),"phithon-full-proof-bad-"));
  try{
    const p=await prepare(root);
    const full=JSON.parse(await readFile(p.full,"utf8"));
    full.obligations[11].obligation_id="constraint.1";
    await writeFile(p.full,JSON.stringify(full),"utf8");
    assert.throws(()=>run(cliArgs(p)),/Command failed/);
    await assert.rejects(access(p.out));
  }finally{await rm(root,{recursive:true,force:true});}
});
test("R14 CLI help exposes explicit full-proof command with no trust promotion",()=>{
  const help=run(["--help"]);
  assert.match(help,/vibe-full-obligations/);
  assert.match(help,/NOT authenticated verification/);
  assert.throws(()=>run(["vibe-full-obligations","--network"]),/Command failed/);
});

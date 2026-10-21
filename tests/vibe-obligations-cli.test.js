import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli=resolve("src/cli.js");
const fixtures=resolve("examples/vibe-behavior");
const sha=s=>createHash("sha256").update(s,"utf8").digest("hex");
function cmd(args) {
  return execFileSync(process.execPath,[cli,...args],{
    encoding:"utf8",timeout:35000,stdio:["ignore","pipe","pipe"]
  });
}
async function setup(root) {
  const paths={};
  for(const [key,name] of Object.entries({
    vibe:"contract.vibe",phi:"implementation.phi",brief:"intent.json",
    proof:"proof.json",link:"link.json",correspondence:"correspondence.json",
    vectors:"vectors.json",props:"properties.json",beh:"behavior.json",
    propReport:"property-report.json",bindings:"bindings.json",out:"ledger.json"
  })) paths[key]=join(root,name);
  const vibeSource=await readFile(join(fixtures,"contract.vibe"),"utf8");
  await writeFile(paths.vibe,vibeSource);
  await writeFile(paths.phi,await readFile(join(fixtures,"implementation.phi"),"utf8"));
  await writeFile(paths.vectors,await readFile(join(fixtures,"vectors.json"),"utf8"));
  await writeFile(paths.props,await readFile(join(fixtures,"properties.json"),"utf8"));
  const sourceHash=sha(vibeSource);
  const brief={
    brief_version:"phase-8.4.intent-brief.v1",source_path:"private/location/contract.vibe",
    source_sha256:sourceHash,intent:{name:"PhiDouble",
      goal:"Double one input number deterministically.",
      inputs:[{name:"x",type:"number"}],outputs:[{name:"doubled",type:"number"}]},
    preserve:["deterministic_contract_shape >= 1"],
    constraints:["no network side effects"],bridge:[],emit_target:"python",domain_profile:null,
    interchange_metadata:{source_kind:"vibe_spec",transformation_state:"raw_intent_contract"}
  };
  const proof={
    brief_version:"phase-8.4.proof-brief.v1",proof_path:"private/location/proof.json",
    proof_artifact_version:"v1",source_path:"private/location/contract.vibe",
    verification_backend:"heuristic",result:{passed:true,emission_blocked:false},
    intent_summary:{source_hash:sourceHash,ir_hash:"a".repeat(64),emit_target:"python",
      package_context:{},domain_profile:null,self_hosting:{}},
    preserve_constraint_summary:{
      obligation_summary:{satisfied:3},
      obligations_sample:[
        {obligation_id:"preserve.determinism",category:"preserve",status:"satisfied",critical:true},
        {obligation_id:"constraint.no-network",category:"constraint",status:"satisfied",critical:false}
      ],obligations_total:3
    },
    bridge_result:{bridge_score:0.94,verdict:"preserved",measurement_ratio:0.88,epsilon_metrics:{}},
    equivalence_drift_summary:{
      intent_equivalence_score:0.9,drift_score:0.1,
      intent_items_total:2,intent_items_missing:0,intent_items_unknown:0
    },
    interchange_metadata:{source_kind:"proof_artifact",consumer_safe:true,
      deterministic_projection:true,notes:["Derived from existing proof artifact fields."]}
  };
  const bindings={
    schema:"phithon.vibe-obligation-bindings.v1",
    provenance:"OPERATOR_CHOSEN_ASSOCIATION_UNATTESTED",
    bindings:[{obligationId:"preserve.determinism",evidence:[
      {type:"behavior",caseId:"positive"},{type:"property",sampleIndex:1}
    ]}]
  };
  await Promise.all([[paths.brief,brief],[paths.proof,proof],[paths.bindings,bindings]].map(
    ([file,val])=>writeFile(file,JSON.stringify(val))
  ));
  cmd(["vibe-link",paths.brief,paths.vibe,paths.phi,"--out",paths.link]);
  cmd(["vibe-proof-link",paths.link,paths.proof,paths.brief,paths.vibe,paths.phi,
    "--out",paths.correspondence]);
  cmd(["vibe-behavior",paths.link,paths.brief,paths.vibe,paths.phi,paths.vectors,
    "--out",paths.beh]);
  cmd(["vibe-properties",paths.link,paths.brief,paths.vibe,paths.phi,paths.props,
    "--out",paths.propReport]);
  return paths;
}
const argv=p=>["vibe-obligations",p.proof,p.correspondence,p.link,p.brief,
  p.vibe,p.phi,p.beh,p.propReport,p.bindings,"--out",p.out];

test("R13 CLI builds a real source-linked R9/R10/R11/R12 obligation map",async()=>{
  const root=await mkdtemp(join(tmpdir(),"phivibe-obligations-"));
  try{
    const paths=await setup(root);
    const message=cmd(argv(paths));
    assert.match(message,/OPERATOR_ASSOCIATIONS_UNATTESTED/);
    assert.match(message,/Not exported: 1/);
    const report=JSON.parse(await readFile(paths.out,"utf8"));
    assert.equal(report.schema,"phithon.vibe-obligation-evidence.v1");
    assert.equal(report.associatedSampledObligations,1);
    assert.equal(report.obligationsOmittedFromProofSample,1);
    assert.equal(report.rows[0].associationStatus,"REPORTED_SAMPLE_MATCHES");
    assert.equal(report.rows[1].associationStatus,"NO_ASSOCIATION");
    assert.equal(report.crossLanguageEquivalenceVerified,false);
    assert.equal(report.reportsIndependentlyAuthenticated,false);
    assert.doesNotMatch(JSON.stringify(report),/private\/location/);
    assert.throws(()=>cmd(argv(paths)),/Command failed/); // exclusive write
  } finally{await rm(root,{recursive:true,force:true});}
});

test("R13 refuses stale PhiThon code or unknown obligation IDs before writing map",async()=>{
  const root=await mkdtemp(join(tmpdir(),"phivibe-obligations-fail-"));
  try{
    const paths=await setup(root);
    const mappings=JSON.parse(await readFile(paths.bindings,"utf8"));
    mappings.bindings[0].obligationId="obligation.never.generated";
    await writeFile(paths.bindings,JSON.stringify(mappings));
    assert.throws(()=>cmd(argv(paths)),/Command failed/);
    await assert.rejects(access(paths.out));
    mappings.bindings[0].obligationId="preserve.determinism";
    await writeFile(paths.bindings,JSON.stringify(mappings));
    await writeFile(paths.phi,"fn evaluate(x) { return x * 4 }\n");
    assert.throws(()=>cmd(argv(paths)),/Command failed/);
    await assert.rejects(access(paths.out));
  } finally{await rm(root,{recursive:true,force:true});}
});

test("R13 help describes sampled obligation associations without proof promotion",()=>{
  const help=cmd(["--help"]);
  assert.match(help,/vibe-obligations/);
  assert.match(help,/proof SAMPLE only/);
  assert.throws(()=>cmd(["vibe-obligations","--unrestricted"]),/Command failed/);
});

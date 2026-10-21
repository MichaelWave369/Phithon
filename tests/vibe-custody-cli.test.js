import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli=resolve("src/cli.js");
const sha=x=>createHash("sha256").update(x,"utf8").digest("hex");
const cmd=args=>execFileSync(process.execPath,[cli,...args],{
  encoding:"utf8",timeout:10000,stdio:["ignore","pipe","pipe"]
});
const source='intent SignMe:\n  goal: "Record reviewed intent"\n  inputs:\n    x: number\n  outputs:\n    y: number\nemit python\n';

async function fixture(directory){
  const paths={};
  for(const name of ["full","brief","source","private","public","wrong","signed"])
    paths[name]=join(directory,name+(name==="source"?".vibe":name==="private"||name==="public"||name==="wrong"?".pem":".json"));
  const obligations=[
    {obligation_id:"preserve.1",category:"preserve",description:"operator-private",
      source_location:"C:/Users/Operator/private.vibe",status:"satisfied",evidence:"secret",critical:true},
    {obligation_id:"constraint.1",category:"constraint",description:"private-check",
      source_location:"/home/private",status:"unknown",evidence:null,critical:false}
  ];
  const artifact={
    artifact_version:"v1",schema_version:"v1",source_path:"/home/private/contract.vibe",
    source_hash:sha(source),ir_hash:"c".repeat(64),emit_target:"python",
    verification_backend:"heuristic",result:{passed:true,emission_blocked:false},
    obligations,provenance:{secret:"should not leak"}
  };
  const brief={
    brief_version:"phase-8.4.proof-brief.v1",
    proof_path:"/home/private/proof.json",
    proof_artifact_version:"v1",source_path:"/home/private/contract.vibe",
    verification_backend:"heuristic",result:{...artifact.result},
    intent_summary:{source_hash:artifact.source_hash,ir_hash:artifact.ir_hash,
      emit_target:"python",package_context:{},domain_profile:null,self_hosting:{}},
    preserve_constraint_summary:{
      obligation_summary:{satisfied:1,unknown:1},
      obligations_sample:obligations.map(({obligation_id,category,status,critical})=>({
        obligation_id,category,status,critical
      })),obligations_total:2
    },
    bridge_result:{bridge_score:0.9,verdict:"preserved",measurement_ratio:0.8,epsilon_metrics:{}},
    equivalence_drift_summary:{intent_equivalence_score:0.9,drift_score:0.1,
      intent_items_total:2,intent_items_missing:0,intent_items_unknown:0},
    interchange_metadata:{source_kind:"proof_artifact",consumer_safe:true,
      deterministic_projection:true,notes:["Derived from existing proof artifact fields."]}
  };
  const keys=generateKeyPairSync("ed25519");
  const wrong=generateKeyPairSync("ed25519");
  await Promise.all([
    writeFile(paths.full,JSON.stringify(artifact)),
    writeFile(paths.brief,JSON.stringify(brief)),
    writeFile(paths.source,source),
    writeFile(paths.private,keys.privateKey.export({format:"pem",type:"pkcs8"}),{mode:0o600}),
    writeFile(paths.public,keys.publicKey.export({format:"pem",type:"spki"})),
    writeFile(paths.wrong,wrong.publicKey.export({format:"pem",type:"spki"}))
  ]);
  return paths;
}
const signArgs=p=>["vibe-custody-sign",p.full,p.brief,p.source,p.private,
  "--out",p.signed,"--confirm-sign"];
const checkArgs=p=>["vibe-custody-check",p.signed,p.full,p.brief,p.source,p.public];

test("R15 CLI offline consented signing and separately supplied public-key verification",async()=>{
  const root=await mkdtemp(join(tmpdir(),"phivibe-custody-cli-"));
  try {
    const p=await fixture(root);
    assert.match(cmd(signArgs(p)),/CUSTODY SIGNED/);
    const envelope=JSON.parse(await readFile(p.signed,"utf8"));
    assert.equal(envelope.schema,"phithon.vibe-custody-envelope.v1");
    assert.equal(envelope.signatureBase64.length,88);
    const result=cmd(checkArgs(p));
    assert.match(result,/VERIFIED SIGNATURE/);
    assert.match(result,/"signatureValid": true/);
    assert.match(result,/"compilerInvocationAttested": false/);
    assert.doesNotMatch(result,/private-check|private.vibe|secret/);
    assert.throws(()=>cmd(signArgs(p)),/Command failed/); // exclusive/no overwrite
  } finally {await rm(root,{recursive:true,force:true});}
});

test("R15 CLI refuses implicit signing and unavailable private-key confirmation",async()=>{
  const root=await mkdtemp(join(tmpdir(),"phivibe-custody-no-consent-"));
  try {
    const p=await fixture(root);
    assert.throws(()=>cmd(signArgs(p).slice(0,-1)),/Command failed/);
    await assert.rejects(access(p.signed));
    assert.throws(()=>cmd(signArgs(p).slice(0,-1).concat("--confirm-remote")) ,/Command failed/);
    await assert.rejects(access(p.signed));
  } finally {await rm(root,{recursive:true,force:true});}
});

test("R15 CLI refuses wrong public key, proof/source mutation and wrong signature",async()=>{
  const root=await mkdtemp(join(tmpdir(),"phivibe-custody-invalid-"));
  try {
    const p=await fixture(root);
    cmd(signArgs(p));
    assert.throws(()=>cmd(["vibe-custody-check",p.signed,p.full,p.brief,p.source,p.wrong]),/Command failed/);
    const envelope=JSON.parse(await readFile(p.signed,"utf8"));
    envelope.signatureBase64="A".repeat(86)+"==";
    await writeFile(p.signed,JSON.stringify(envelope));
    assert.throws(()=>cmd(checkArgs(p)),/Command failed/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test("R15 help accurately describes signature custody scope and no compiler attestation",()=>{
  const help=cmd(["--help"]);
  assert.match(help,/vibe-custody-sign/);
  assert.match(help,/vibe-custody-check/);
  assert.match(help,/NOT compiler execution or signer identity/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli.js");
function run(args) {
  return execFileSync(process.execPath, [cli, ...args], {
    encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"]
  });
}
const digest = x => createHash("sha256").update(x, "utf8").digest("hex");
const vibeSrc = 'intent ProofExample:\n  goal: "Return output"\n  inputs:\n    n: number\n  outputs:\n    result: number\nemit python\n';
const phiSrc = "print(2 + 2)\n";
const brief = () => ({
  brief_version: "phase-8.4.intent-brief.v1",
  source_path: "demo.vibe",
  source_sha256: digest(vibeSrc),
  intent: {name:"ProofExample",goal:"Return output",inputs:[{name:"n",type:"number"}],outputs:[{name:"result",type:"number"}]},
  preserve:[],constraints:[],bridge:[],emit_target:"python",domain_profile:null,
  interchange_metadata:{source_kind:"vibe_spec",transformation_state:"raw_intent_contract"}
});
const proof = () => ({
  brief_version:"phase-8.4.proof-brief.v1",
  proof_path:"demo.vibe.proof.json",
  proof_artifact_version:"v1",
  source_path:"demo.vibe",
  verification_backend:"heuristic",
  result:{passed:true,emission_blocked:false},
  intent_summary:{source_hash:digest(vibeSrc),ir_hash:"b".repeat(64),emit_target:"python",package_context:{},domain_profile:null,self_hosting:{}},
  preserve_constraint_summary:{obligation_summary:{satisfied:1},obligations_sample:[{obligation_id:"a",category:"preserve",status:"satisfied",critical:false}],obligations_total:1},
  bridge_result:{bridge_score:0.94,verdict:"preserved",measurement_ratio:0.9,epsilon_metrics:{}},
  equivalence_drift_summary:{intent_equivalence_score:0.9,drift_score:0.1,intent_items_total:1,intent_items_missing:0,intent_items_unknown:0},
  interchange_metadata:{source_kind:"proof_artifact",consumer_safe:true,deterministic_projection:true,notes:["Derived from existing proof artifact fields."]}
});

test("R10 CLI correlates Vibe proof brief with live R9 Vibe/PhiThon source link", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vibe-proof-correspondence-"));
  try {
    const vibe=join(dir,"demo.vibe"),phi=join(dir,"demo.phi"),intent=join(dir,"intent.json"),
      proofPath=join(dir,"proof.json"),link=join(dir,"source-link.json"),record=join(dir,"correspondence.json");
    for (const [file,content] of [
      [vibe,vibeSrc],[phi,phiSrc],[intent,JSON.stringify(brief())],[proofPath,JSON.stringify(proof())]
    ]) await writeFile(file,content);
    assert.match(run(["vibe-link",intent,vibe,phi,"--out",link]),/DECLARED_NOT_VERIFIED/);
    assert.match(run(["vibe-proof-inspect",proofPath]),/SELF-REPORTED/);
    const before = run(["vibe-proof-link",link,proofPath,intent,vibe,phi,"--out",record]);
    assert.match(before,/SOURCE HASHES MATCH/);
    const contents = JSON.parse(await readFile(record,"utf8"));
    assert.equal(contents.report.compilerPassReported,true);
    assert.equal(contents.checks.crossLanguageSemanticEquivalenceVerified,false);
    assert.equal(contents.canExecute,false);
    assert.match(run(["vibe-proof-link-check",record,link,proofPath,intent,vibe,phi]),/CORRESPONDENCE MATCH/);
    // A changed report remains a claim, but cannot secretly change the saved correspondence.
    const altered = proof(); altered.result.passed = false;
    await writeFile(proofPath,JSON.stringify(altered));
    assert.throws(() => run(["vibe-proof-link-check",record,link,proofPath,intent,vibe,phi]),/Command failed/);
    // Exclusive creation forbids replacing the previous operator-reviewed record.
    assert.throws(() => run(["vibe-proof-link",link,proofPath,intent,vibe,phi,"--out",record]),/Command failed/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test("R10 CLI rejects altered Vibe source/hash, fabricated proof metadata and missing consent-free switches", async () => {
  const dir=await mkdtemp(join(tmpdir(),"vibe-proof-negative-"));
  try {
    const vibe=join(dir,"demo.vibe"),phi=join(dir,"demo.phi"),intent=join(dir,"intent.json"),
      proofPath=join(dir,"proof.json"),link=join(dir,"source-link.json"),record=join(dir,"correspondence.json");
    for(const [file,content] of [[vibe,vibeSrc],[phi,phiSrc],[intent,JSON.stringify(brief())],[proofPath,JSON.stringify(proof())]]) await writeFile(file,content);
    run(["vibe-link",intent,vibe,phi,"--out",link]);
    const wrong = proof(); wrong.intent_summary.source_hash = "f".repeat(64);
    await writeFile(proofPath,JSON.stringify(wrong));
    assert.throws(() => run(["vibe-proof-link",link,proofPath,intent,vibe,phi,"--out",record]),/Command failed/);
    assert.throws(() => run(["vibe-proof-link",link,proofPath,intent,vibe,phi,"--overwrite",record]),/Command failed/);
    const modified=proof(); modified.executionAuthorization=true;
    await writeFile(proofPath,JSON.stringify(modified));
    assert.throws(() => run(["vibe-proof-inspect",proofPath]),/Command failed/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test("R10 help makes clear proof import is untrusted and does not certify PhiThon", () => {
  const help = run(["--help"]);
  assert.match(help,/vibe-proof-link/);
  assert.match(help,/WITHOUT granting authority/);
  assert.match(run([resolve("examples/hello.phi")]),/Welcome to PhiThon/);
});

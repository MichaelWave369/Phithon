import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli=resolve("src/cli.js");
function run(args) {
  return execFileSync(process.execPath, [cli, ...args], {
    encoding:"utf8",timeout:15_000,stdio:["ignore","pipe","pipe"]
  });
}
const fixtureRoot=resolve("examples/vibe-behavior");
const vibeFixture=join(fixtureRoot,"contract.vibe");
const phiFixture=join(fixtureRoot,"implementation.phi");
const vectorsFixture=join(fixtureRoot,"vectors.json");
const hash=x=>createHash("sha256").update(x,"utf8").digest("hex");
async function createFiles(dir) {
  const vibe=join(dir,"contract.vibe");
  const phi=join(dir,"implementation.phi");
  const vectors=join(dir,"vectors.json");
  const intent=join(dir,"intent.json");
  const link=join(dir,"link.json");
  const report=join(dir,"report.json");
  const vibeSource=await readFile(vibeFixture,"utf8");
  await writeFile(vibe,vibeSource);
  await writeFile(phi,await readFile(phiFixture,"utf8"));
  await writeFile(vectors,await readFile(vectorsFixture,"utf8"));
  const brief={
    brief_version:"phase-8.4.intent-brief.v1",
    source_path:"operator/private/contract.vibe",
    source_sha256:hash(vibeSource),
    intent:{
      name:"PhiDouble",goal:"Double one input number deterministically.",
      inputs:[{name:"x",type:"number"}],outputs:[{name:"doubled",type:"number"}]
    },
    preserve:["deterministic_contract_shape >= 1"],
    constraints:["no network side effects"],
    bridge:[],emit_target:"python",domain_profile:null,
    interchange_metadata:{source_kind:"vibe_spec",transformation_state:"raw_intent_contract"}
  };
  await writeFile(intent,JSON.stringify(brief));
  run(["vibe-link",intent,vibe,phi,"--out",link]);
  return {vibe,phi,vectors,intent,link,report};
}

test("R11 CLI runs all human-reviewed selected cases in bounded PhiShield children", async () => {
  const dir=await mkdtemp(join(tmpdir(),"phivibe-vectors-"));
  try {
    const f=await createFiles(dir);
    const output=run(["vibe-behavior",f.link,f.intent,f.vibe,f.phi,f.vectors,"--out",f.report]);
    assert.match(output,/ALL_SELECTED_CASES_MATCH/);
    assert.match(output,/Matches: 4 Mismatches: 0 Errors: 0/);
    const report=JSON.parse(await readFile(f.report,"utf8"));
    assert.equal(report.schema,"phithon.vibe-behavior-report.v1");
    assert.equal(report.caseCount,4);
    assert.equal(report.matches,4);
    assert.equal(report.semanticEquivalenceVerified,false);
    assert.equal(report.intentPreservationProven,false);
    assert.equal(report.cases[2].status,"MATCH");
    assert.equal(report.cases[2].observedOutputSha256,hash("42"));
    assert.doesNotMatch(JSON.stringify(report),/operator\/private/);
    // Exclusive file creation prevents erasing the reviewed first report.
    assert.throws(()=>run(["vibe-behavior",f.link,f.intent,f.vibe,f.phi,f.vectors,"--out",f.report]),/Command failed/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test("R11 CLI writes mismatch report but returns non-zero exit status", async () => {
  const dir=await mkdtemp(join(tmpdir(),"phivibe-mismatch-"));
  try {
    const f=await createFiles(dir);
    const vectors=JSON.parse(await readFile(f.vectors,"utf8"));
    vectors.cases[2].expectedOutput="wrong";
    await writeFile(f.vectors,JSON.stringify(vectors));
    assert.throws(()=>run(["vibe-behavior",f.link,f.intent,f.vibe,f.phi,f.vectors,"--out",f.report]),/Command failed/);
    const report=JSON.parse(await readFile(f.report,"utf8"));
    assert.equal(report.matches,3);
    assert.equal(report.mismatches,1);
    assert.equal(report.outcome,"SELECTED_CASES_NOT_ALL_MATCHED");
    assert.equal(report.semanticEquivalenceVerified,false);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test("R11 refusal occurs before any child execution on stale R9 source link", async () => {
  const dir=await mkdtemp(join(tmpdir(),"phivibe-stale-"));
  try {
    const f=await createFiles(dir);
    await writeFile(f.phi,"fn evaluate(x) { return x * 3 }\n");
    assert.throws(()=>run(["vibe-behavior",f.link,f.intent,f.vibe,f.phi,f.vectors,"--out",f.report]),/Command failed/);
    await assert.rejects(access(f.report));
  } finally {await rm(dir,{recursive:true,force:true});}
});

test("R11 CLI help describes sample-only evidence and refuses unknown permission flags", () => {
  const help=run(["--help"]);
  assert.match(help,/vibe-behavior/);
  assert.match(help,/NOT exhaustive equivalence/);
  assert.throws(()=>run(["vibe-behavior","--allow-network"]),/Command failed/);
});

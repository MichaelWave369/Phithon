import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli=resolve("src/cli.js");
const fixture=resolve("examples/vibe-behavior");
const sha=x=>createHash("sha256").update(x,"utf8").digest("hex");
const command=args=>execFileSync(process.execPath,[cli,...args],{
  encoding:"utf8",timeout:20000,stdio:["ignore","pipe","pipe"]
});
async function setup(dir) {
  const paths={vibe:join(dir,"contract.vibe"),phi:join(dir,"implementation.phi"),
    plan:join(dir,"properties.json"),brief:join(dir,"intent-brief.json"),
    link:join(dir,"link.json"),report:join(dir,"properties-report.json")};
  const source=await readFile(join(fixture,"contract.vibe"),"utf8");
  await writeFile(paths.vibe,source);
  await writeFile(paths.phi,await readFile(join(fixture,"implementation.phi"),"utf8"));
  await writeFile(paths.plan,await readFile(join(fixture,"properties.json"),"utf8"));
  const brief={
    brief_version:"phase-8.4.intent-brief.v1",
    source_path:"private/contract.vibe",
    source_sha256:sha(source),
    intent:{name:"PhiDouble",goal:"Double one input number deterministically.",
      inputs:[{name:"x",type:"number"}],outputs:[{name:"doubled",type:"number"}]},
    preserve:["deterministic_contract_shape >= 1"],
    constraints:["no network side effects"],
    bridge:[],emit_target:"python",domain_profile:null,
    interchange_metadata:{source_kind:"vibe_spec",transformation_state:"raw_intent_contract"}
  };
  await writeFile(paths.brief,JSON.stringify(brief));
  command(["vibe-link",paths.brief,paths.vibe,paths.phi,"--out",paths.link]);
  return paths;
}
function argv(paths) {
  return ["vibe-properties",paths.link,paths.brief,paths.vibe,
    paths.phi,paths.plan,"--out",paths.report];
}

test("R12 CLI runs seeded property checks via fixed PhiShield and records redacted results", async () => {
  const dir=await mkdtemp(join(tmpdir(),"phivibe-properties-"));
  try {
    const p=await setup(dir);
    const stdout=command(argv(p));
    assert.match(stdout,/ALL_SAMPLED_CHECKS_MATCH/);
    assert.match(stdout,/Matches: 6 Mismatches: 0 Errors: 0/);
    const report=JSON.parse(await readFile(p.report,"utf8"));
    assert.equal(report.schema,"phithon.vibe-property-report.v1");
    assert.equal(report.sampleCount,6);
    assert.equal(report.matches,6);
    assert.equal(report.seed,369);
    assert.equal(report.crossLanguageSemanticEquivalenceVerified,false);
    assert.equal(report.exhaustiveCoverageProven,false);
    assert.doesNotMatch(JSON.stringify(report),/private\/contract\.vibe/);
    assert.throws(()=>command(argv(p)),/Command failed/); // no overwrite
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test("R12 CLI saves report but exits nonzero when seeded property checks fail", async () => {
  const dir=await mkdtemp(join(tmpdir(),"phivibe-properties-mismatch-"));
  try {
    const p=await setup(dir);
    const pl=JSON.parse(await readFile(p.plan,"utf8"));
    pl.property.factor=5;
    await writeFile(p.plan,JSON.stringify(pl));
    assert.throws(()=>command(argv(p)),/Command failed/);
    const report=JSON.parse(await readFile(p.report,"utf8"));
    assert.ok(report.mismatches>0);
    assert.equal(report.outcome,"SAMPLED_CHECKS_NOT_ALL_MATCHED");
    assert.equal(report.vibePreservationProven,false);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test("R12 CLI refuses stale source links before saving any report", async () => {
  const dir=await mkdtemp(join(tmpdir(),"phivibe-properties-stale-"));
  try {
    const p=await setup(dir);
    await writeFile(p.phi,"fn evaluate(x) { return x * 3 }\n");
    assert.throws(()=>command(argv(p)),/Command failed/);
    await assert.rejects(access(p.report));
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test("R12 help states sampled properties cannot prove Vibe/PhiThon semantics", () => {
  const help=command(["--help"]);
  assert.match(help,/vibe-properties/);
  assert.match(help,/NOT universal proof/);
  assert.throws(()=>command(["vibe-properties","--allow-network"]),/Command failed/);
});

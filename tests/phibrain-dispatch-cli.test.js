import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { makeBrainHandoff } from "../src/brain/handoff.js";
const cli = resolve("src/cli.js");

function command(args) {
  return execFileSync(process.execPath, [cli, ...args], {
    encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "pipe"]
  });
}
test("CLI requires explicit local consent, model, request ID and output path", async () => {
  const folder=await mkdtemp(join(tmpdir(),"phibrain-dispatch-denied-"));
  const handoff=join(folder,"handoff.json"), output=join(folder,"result.json");
  try {
    await writeFile(handoff,JSON.stringify(makeBrainHandoff([{id:1,route:"local",prompt:"What is one test?"}])));
    const candidates=[
      ["dispatch-local",handoff,"--model","gemma3:12b","--request","1","--out",output],
      ["dispatch-local",handoff,"--model","gemma3:12b","--request","1","--out",output,"--confirm"],
      ["dispatch-local",handoff,"--model","gemma3:12b","--request","1","--out",output,"--confirm-local","--extra"],
      ["dispatch-local",handoff,"--model","gemma3:12b","--request","1","--out",output,"--confirm-local","--confirm-local"]
    ];
    for(const argv of candidates) assert.throws(()=>command(argv),/Command failed/);
    await assert.rejects(access(output));
  } finally { await rm(folder,{recursive:true,force:true}); }
});
test("CLI never contacts SPV and never writes output for a non-local route", async () => {
  const folder=await mkdtemp(join(tmpdir(),"phibrain-dispatch-route-"));
  const handoff=join(folder,"handoff.json"), output=join(folder,"result.json");
  try {
    await writeFile(handoff,JSON.stringify(makeBrainHandoff([{id:1,route:"spv",prompt:"Please route."}])));
    assert.throws(()=>command(["dispatch-local",handoff,"--model","gemma3:12b","--request","1","--out",output,"--confirm-local"]),/Command failed/);
    await assert.rejects(access(output));
  } finally { await rm(folder,{recursive:true,force:true}); }
});
test("CLI --help explains that explicit dispatch is local-only", () => {
  const help=command(["--help"]);
  assert.match(help,/--confirm-local/);
  assert.match(help,/127\.0\.0\.1:11434/);
  assert.match(help,/SPV/);
});

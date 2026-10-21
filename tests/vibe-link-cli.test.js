import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("src/cli.js");
function run(args) {
  return execFileSync(process.execPath, [cli, ...args], {
    encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"]
  });
}
const vibeSrc = 'intent Demo:\n  goal: "Provide reliable output."\n  inputs:\n    value: number\n  outputs:\n    result: number\n\nemit python\n';
const phiSrc = "print(1 + 2)\n";
const digest = text => createHash("sha256").update(text).digest("hex");
const vibeBrief = () => ({
  brief_version: "phase-8.4.intent-brief.v1",
  source_path: "/operator/private/path/demo.vibe",
  source_sha256: digest(vibeSrc),
  intent: {
    name: "Demo", goal: "Provide reliable output.",
    inputs: [{name:"value",type:"number"}],
    outputs: [{name:"result",type:"number"}]
  },
  preserve: [], constraints: [], bridge: [], emit_target: "python", domain_profile: null,
  interchange_metadata: { source_kind:"vibe_spec", transformation_state:"raw_intent_contract" }
});

test("R9 CLI links real Vibe brief schema to PhiThon .phi program, detects source drift", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phi-vibe-link-"));
  try {
    const vibe = join(dir, "contract.vibe");
    const phi = join(dir, "implementation.phi");
    const brief = join(dir, "intent-brief.json");
    const link = join(dir, "link.json");
    await writeFile(vibe, vibeSrc);
    await writeFile(phi, phiSrc);
    await writeFile(brief, JSON.stringify(vibeBrief()));
    const summary = run(["vibe-inspect", brief]);
    assert.match(summary, /DECLARED_INTENT_UNVERIFIED/);
    assert.doesNotMatch(summary, /operator\/private/);
    const result = run(["vibe-link", brief, vibe, phi, "--out", link]);
    assert.match(result, /DECLARED_NOT_VERIFIED/);
    const saved = JSON.parse(await readFile(link, "utf8"));
    assert.equal(saved.schema, "phithon.vibe-intent-link.v1");
    assert.equal(saved.verification.semanticEquivalenceVerified, false);
    assert.equal(saved.executionAuthorized, false);
    assert.match(run(["vibe-link-check", link, brief, vibe, phi]), /SOURCE LINK MATCH/);
    // Cannot silently overwrite an existing reviewed link.
    assert.throws(() => run(["vibe-link", brief, vibe, phi, "--out", link]), /Command failed/);
    await writeFile(phi, "print(2 + 2)\n");
    assert.throws(() => run(["vibe-link-check", link, brief, vibe, phi]), /Command failed/);
  } finally {
    await rm(dir, {recursive:true, force:true});
  }
});

test("R9 refuses a Vibe brief that doesn't match the actual .vibe source", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phi-vibe-invalid-"));
  try {
    const vibe = join(dir, "contract.vibe");
    const phi = join(dir, "implementation.phi");
    const brief = join(dir, "intent-brief.json");
    const link = join(dir, "link.json");
    await writeFile(vibe, vibeSrc + "\n");
    await writeFile(phi, phiSrc);
    await writeFile(brief, JSON.stringify(vibeBrief()));
    assert.throws(() => run(["vibe-link", brief, vibe, phi, "--out", link]), /Command failed/);
  } finally {
    await rm(dir, {recursive:true, force:true});
  }
});

test("R9 help exposes Vibe interoperability without expanding PhiThon execution authority", () => {
  const help = run(["--help"]);
  assert.match(help, /vibe-inspect/);
  assert.match(help, /vibe-link/);
  assert.match(help, /semantic equivalence/);
  assert.match(run([resolve("examples/hello.phi")]), /Welcome to PhiThon/);
});

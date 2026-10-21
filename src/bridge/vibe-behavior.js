/**
 * R11 PhiVibe behavioral vectors (Node CLI only).
 *
 * Runs one explicitly human-authored, fixed-input test per PhiShield child.
 * Tests are selected examples, NOT formal coverage, Vibe compilation,
 * independent attestation, or cross-language equivalence.
 */
import { createHash } from "node:crypto";
import { runIsolated } from "../cli/isolate.js";
import { validateVibeBrief, verifyVibePhiLink } from "./vibe-intent.js";
import { analyzePackage, validateModuleRegistry } from "../language/package.js";
import { parse } from "../language/core.js";

export const VIBE_VECTORS_SCHEMA = "phithon.vibe-behavior-vectors.v1";
export const VIBE_BEHAVIOR_REPORT_SCHEMA = "phithon.vibe-behavior-report.v1";
export const MAX_VIBE_VECTORS_BYTES = 24_576;
export const MAX_VIBE_CASES = 8;

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const CASE_ID = /^[a-z][a-z0-9_-]{0,39}$/;
const REVIEW = "OPERATOR_SELECTED_EXPECTATIONS_UNATTESTED";
const digest = x => createHash("sha256").update(x, "utf8").digest("hex");
const isObj = x => x !== null && typeof x === "object" && !Array.isArray(x);
const exact = (x, keys) => isObj(x) && Object.keys(x).length === keys.length &&
  Object.keys(x).every(key => keys.includes(key));
function must(ok, message) {
  if (!ok) throw new TypeError("PhiVibe vectors: " + message);
}
function validText(x, limit) {
  return typeof x === "string" && x.length <= limit &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x);
}
function typedLiteral(value, declaredType) {
  if (declaredType === "number") {
    must(typeof value === "number" && Number.isFinite(value) &&
      Math.abs(value) <= 1_000_000, "number input must be finite and bounded");
    return JSON.stringify(value);
  }
  if (declaredType === "string") {
    must(validText(value, 128), "string input invalid or too long");
    return JSON.stringify(value);
  }
  if (declaredType === "bool" || declaredType === "boolean") {
    must(typeof value === "boolean", "boolean input must be true/false");
    return value ? "true" : "false";
  }
  throw new TypeError("PhiVibe vectors: unsupported Vibe input type " + String(declaredType));
}
export function validateVibeVectors(raw, intentBrief) {
  const brief = validateVibeBrief(intentBrief);
  must(exact(raw, ["schema", "intentName", "entryFunction", "provenance", "cases"]),
    "invalid manifest fields");
  must(raw.schema === VIBE_VECTORS_SCHEMA && raw.intentName === brief.intent.name,
    "manifest schema or Vibe intent name mismatch");
  must(raw.provenance === REVIEW && IDENTIFIER.test(raw.entryFunction) &&
    !["print", "ledger", "brain_request"].includes(raw.entryFunction),
    "invalid or privileged entry function name");
  const inputs = brief.intent.inputs;
  must(inputs.length <= 4 && brief.intent.outputs.length === 1,
    "R11 supports at most 4 Vibe inputs and exactly 1 declared output");
  must(inputs.every(f => ["number", "string", "bool", "boolean"].includes(f.type)),
    "unsupported declared Vibe input type");
  must(Array.isArray(raw.cases) && raw.cases.length > 0 &&
    raw.cases.length <= MAX_VIBE_CASES, "R11 supports 1 to 8 cases");
  const ids = new Set();
  for (const test of raw.cases) {
    must(exact(test, ["id", "inputs", "expectedOutput"]), "invalid test fields");
    must(typeof test.id === "string" && CASE_ID.test(test.id) &&
      !ids.has(test.id), "invalid/duplicate test id");
    ids.add(test.id);
    must(Array.isArray(test.inputs) && test.inputs.length === inputs.length,
      "input arity differs from Vibe intent declaration");
    test.inputs.forEach((arg, i) => typedLiteral(arg, inputs[i].type));
    must(validText(test.expectedOutput, 256), "expected output must be bounded text");
  }
  return raw;
}
export function parseVibeVectorsJson(raw, intentBrief) {
  must(typeof raw === "string" &&
    Buffer.byteLength(raw, "utf8") <= MAX_VIBE_VECTORS_BYTES,
    "manifest must be UTF-8 JSON under 24 KiB");
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new TypeError("PhiVibe vectors: invalid JSON"); }
  return validateVibeVectors(data, intentBrief);
}
function invocation(entry, args, declaredFields) {
  return "print(" + entry + "(" + args.map((v, i) => typedLiteral(v, declaredFields[i].type)).join(", ") + "))\n";
}
/**
 * The exact entry source and PhiPack modules must match the *existing* R9
 * source link. Each test appends one function invocation to the source,
 * runs in a fresh bounded child with brainGrant=false and captures one line.
 *
 * Only digests of expected/observed output are persisted; no raw output or
 * supplied input values appear in the report.
 */
export async function runVibeBehaviorVectors({
  link, intentBrief, vibeSource, phiSource, modules = {}, vectors,
  runner = runIsolated
}) {
  validateModuleRegistry(modules);
  validateVibeVectors(vectors, intentBrief);
  const match = await verifyVibePhiLink(link, intentBrief, vibeSource, phiSource, modules);
  must(match.valid, "R9 source link mismatch: " + match.reason);
  analyzePackage(phiSource, modules);
  const declared = parse(phiSource).filter(node => node.tag === "fn" && node.name === vectors.entryFunction);
  must(declared.length === 1 && declared[0].params.length === intentBrief.intent.inputs.length,
    "entryFunction must name one top-level PhiThon fn with Vibe input arity");
  must(typeof phiSource === "string" && phiSource.length <= 90_000,
    "entry source too large for isolated harness");

  const rows = [];
  for (const test of vectors.cases) {
    const combined = phiSource + "\n" +
      invocation(vectors.entryFunction, test.inputs, intentBrief.intent.inputs);
    const base = {
      id: test.id,
      expectedOutputSha256: digest(test.expectedOutput),
      inputSha256: digest(JSON.stringify(test.inputs)),
      harnessSourceSha256: digest(combined)
    };
    try {
      // Different child for every case. No user-supplied command or process.
      const execution = await runner(combined, {
        mode: "execute", modules, brainGrant: false, timeoutMs: 2500
      });
      must(execution && Array.isArray(execution.output), "malformed child execution");
      const single = execution.output.length === 1 && typeof execution.output[0] === "string";
      const observed = single ? execution.output[0] : null;
      const pass = single && observed === test.expectedOutput;
      rows.push({
        ...base,
        status: pass ? "MATCH" : "MISMATCH",
        outputLineCount: execution.output.length,
        observedOutputSha256: observed === null ? null : digest(observed),
        stepsReported: Number.isSafeInteger(execution.steps) && execution.steps >= 0
          ? execution.steps : null,
        errorClass: null
      });
    } catch {
      // Fail closed; never turn a runtime error/timeout into a passing test.
      rows.push({
        ...base, status: "ERROR", outputLineCount: null,
        observedOutputSha256: null, stepsReported: null,
        errorClass: "EXECUTION_ERROR_OR_TIMEOUT"
      });
    }
  }
  const matches = rows.filter(r => r.status === "MATCH").length;
  const mismatches = rows.filter(r => r.status === "MISMATCH").length;
  const errors = rows.filter(r => r.status === "ERROR").length;
  return {
    schema: VIBE_BEHAVIOR_REPORT_SCHEMA,
    intentName: intentBrief.intent.name,
    vibeSourceSha256: link.vibe.sourceSha256,
    phithonSourceSha256: link.phithon.sourceSha256,
    moduleHashes: { ...link.phithon.moduleHashes },
    sourceLinkSha256: digest(JSON.stringify(link)),
    vectorManifestSha256: digest(JSON.stringify(vectors)),
    entryFunction: vectors.entryFunction,
    caseCount: rows.length,
    matches,
    mismatches,
    errors,
    outcome: matches === rows.length ? "ALL_SELECTED_CASES_MATCH" : "SELECTED_CASES_NOT_ALL_MATCHED",
    cases: rows,
    provenance: "OPERATOR_SELECTED_EXPECTATIONS_UNATTESTED",
    executionEvidence: "LOCAL_PHISHIELD_CHILD_OUTPUT_UNATTESTED",
    intentPreservationProven: false,
    semanticEquivalenceVerified: false,
    exhaustiveCoverageProven: false,
    vibeVerifierRun: false,
    executionAuthorizedOutsideRunner: false,
    modelRoutingApproved: false
  };
}

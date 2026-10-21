/**
 * PhiVibe R12: bounded, deterministic numeric property sampling.
 *
 * R9 links original Vibe/PhiThon sources. R12 generates reproducible finite
 * test inputs for *operator-declared* properties, runs only PhiThon inside
 * ordinary PhiShield bounded children, and records UNATTESTED observations.
 * It does not infer properties from Vibe syntax or execute Vibe itself.
 */
import { createHash } from "node:crypto";
import { runIsolated } from "../cli/isolate.js";
import { validateVibeBrief, verifyVibePhiLink } from "./vibe-intent.js";
import { analyzePackage, validateModuleRegistry } from "../language/package.js";
import { parse } from "../language/core.js";

export const VIBE_PROPERTIES_SCHEMA = "phithon.vibe-property-plan.v1";
export const VIBE_PROPERTY_REPORT_SCHEMA = "phithon.vibe-property-report.v1";
export const MAX_VIBE_PROPERTIES_BYTES = 16_384;
const MAX_SAMPLES = 12;
const MIN_SAMPLES = 3;
const SEED_MAX = 0xffff_ffff;
const INTEGER_LIMIT = 1_000;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const OUTPUT_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const object = x => x !== null && typeof x === "object" && !Array.isArray(x);
const exact = (o, keys) => object(o) && Object.keys(o).length === keys.length &&
  Object.keys(o).every(k => keys.includes(k));
const digest = s => createHash("sha256").update(s, "utf8").digest("hex");
function ensure(x, message) { if (!x) throw new TypeError("PhiVibe properties: " + message); }
function int(x, min, max) { return Number.isSafeInteger(x) && x >= min && x <= max; }

/** No arbitrary code snippets, comparisons, JavaScript, or arbitrary test functions. */
export function validateVibePropertyPlan(plan, brief) {
  validateVibeBrief(brief);
  ensure(exact(plan, ["schema", "intentName", "entryFunction", "provenance",
    "seed", "minInput", "maxInput", "samples", "property"]), "invalid plan keys");
  ensure(plan.schema === VIBE_PROPERTIES_SCHEMA &&
    plan.intentName === brief.intent.name, "schema or intent name mismatch");
  ensure(plan.provenance === "OPERATOR_DECLARED_PROPERTY_UNATTESTED" &&
    typeof plan.entryFunction === "string" &&
    IDENTIFIER.test(plan.entryFunction) &&
    !["print", "ledger", "brain_request"].includes(plan.entryFunction),
    "invalid function/provenance");
  ensure(brief.intent.inputs.length === 1 &&
    brief.intent.inputs[0].type === "number" &&
    brief.intent.outputs.length === 1 &&
    brief.intent.outputs[0].type === "number",
    "R12 requires one numeric Vibe input and one numeric output");
  ensure(int(plan.seed, 1, SEED_MAX), "seed must be an unsigned nonzero 32-bit integer");
  ensure(int(plan.minInput, -INTEGER_LIMIT, INTEGER_LIMIT) &&
    int(plan.maxInput, -INTEGER_LIMIT, INTEGER_LIMIT) &&
    plan.minInput < plan.maxInput, "integer input domain invalid");
  ensure(int(plan.samples, MIN_SAMPLES, MAX_SAMPLES) &&
    plan.samples <= plan.maxInput - plan.minInput + 1,
    "sample count must fit domain (3..12)");
  const prop = plan.property;
  ensure(object(prop) && own(prop, "kind"), "property must be a known object");
  switch (prop.kind) {
    case "affine": {
      ensure(exact(prop, ["kind", "factor", "offset"]) &&
        int(prop.factor, -100, 100) && int(prop.offset, -100, 100),
        "affine needs bounded integer factor and offset");
      break;
    }
    case "nonnegative":
    case "monotonic_nondecreasing":
    case "repeatable":
      ensure(exact(prop, ["kind"]), "unexpected property parameters");
      break;
    default:
      throw new TypeError("PhiVibe properties: unknown property kind");
  }
  return plan;
}

export function parseVibePropertyPlanJson(raw, brief) {
  ensure(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= MAX_VIBE_PROPERTIES_BYTES,
    "property plan must be JSON under 16 KiB");
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new TypeError("PhiVibe properties: malformed JSON"); }
  return validateVibePropertyPlan(value, brief);
}

/**
 * Stable sampling, not random coverage: endpoints, zero when in domain,
 * and a deterministic xorshift32 sequence. Sorted for monotonicity checks.
 */
export function generateVibePropertySamples(plan, brief) {
  validateVibePropertyPlan(plan, brief);
  const chosen = new Set([plan.minInput, plan.maxInput]);
  if (plan.minInput <= 0 && plan.maxInput >= 0) chosen.add(0);
  let state = plan.seed >>> 0;
  let iterations = 0;
  while (chosen.size < plan.samples) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    const span = plan.maxInput - plan.minInput + 1;
    chosen.add(plan.minInput + (state % span));
    // A deterministic fallback avoids pathological modulo collisions.
    iterations++;
    if (iterations >= 512 && chosen.size < plan.samples) {
      for (let x = plan.minInput; x <= plan.maxInput && chosen.size < plan.samples; x++) {
        chosen.add(x);
      }
    }
  }
  return [...chosen].sort((a, b) => a - b);
}

function parseObservedNumber(output) {
  if (!Array.isArray(output) || output.length !== 1 ||
    typeof output[0] !== "string" || output[0].length > 128 ||
    !OUTPUT_NUMBER.test(output[0])) return null;
  const value = Number(output[0]);
  return Number.isFinite(value) ? value : null;
}

async function invokeOne({source, name, input, modules, runner}) {
  const harness = source + "\nprint(" + name + "(" + JSON.stringify(input) + "))\n";
  try {
    const exec = await runner(harness, {
      mode: "execute", modules, brainGrant: false, timeoutMs: 2500
    });
    const observed = parseObservedNumber(exec?.output);
    return {
      valid: observed !== null,
      observed,
      observedHash: exec?.output?.length === 1 && typeof exec.output[0] === "string"
        ? digest(exec.output[0]) : null,
      harnessHash: digest(harness),
      steps: Number.isSafeInteger(exec?.steps) && exec.steps >= 0 ? exec.steps : null
    };
  } catch {
    return {valid: false, observed: null, observedHash: null,
      harnessHash: digest(harness), steps: null};
  }
}

export async function runVibePropertyPlan({
  link, intentBrief, vibeSource, phiSource, modules = {}, plan,
  runner = runIsolated
}) {
  validateVibePropertyPlan(plan, intentBrief);
  validateModuleRegistry(modules);
  const check = await verifyVibePhiLink(
    link, intentBrief, vibeSource, phiSource, modules
  );
  ensure(check.valid, "R9 source link mismatch: " + check.reason);
  ensure(phiSource.length <= 90_000, "PhiThon source too large for test harness");
  analyzePackage(phiSource, modules);
  const declarations = parse(phiSource).filter(s =>
    s.tag === "fn" && s.name === plan.entryFunction
  );
  ensure(declarations.length === 1 && declarations[0].params.length === 1,
    "entryFunction must be a top-level unary PhiThon fn");

  const samples = generateVibePropertySamples(plan, intentBrief);
  const rows = [];
  let previous = null;
  for (const input of samples) {
    const first = await invokeOne({
      source: phiSource, name: plan.entryFunction, input, modules, runner
    });
    let second = null;
    if (plan.property.kind === "repeatable") {
      second = await invokeOne({
        source: phiSource, name: plan.entryFunction, input, modules, runner
      });
    }

    let status = "MATCH";
    if (!first.valid || (second && !second.valid)) {
      status = "ERROR";
    } else if (plan.property.kind === "affine") {
      const expected = plan.property.factor * input + plan.property.offset;
      status = first.observed === expected ? "MATCH" : "MISMATCH";
    } else if (plan.property.kind === "nonnegative") {
      status = first.observed >= 0 ? "MATCH" : "MISMATCH";
    } else if (plan.property.kind === "repeatable") {
      status = first.observed === second.observed ? "MATCH" : "MISMATCH";
    } else if (plan.property.kind === "monotonic_nondecreasing") {
      status = previous !== null && first.observed < previous ? "MISMATCH" : "MATCH";
    }

    // Missing previous output must never be treated as proving monotonicity.
    if (plan.property.kind === "monotonic_nondecreasing") {
      if (previous === null && rows.length > 0) status = status === "ERROR" ? "ERROR" : "INCONCLUSIVE";
      previous = first.valid ? first.observed : null;
    }
    rows.push({
      index: rows.length + 1,
      inputSha256: digest(JSON.stringify(input)),
      harnessSha256: first.harnessHash,
      observedSha256: first.observedHash,
      repeatObservedSha256: second?.observedHash ?? null,
      stepsReported: first.steps,
      repeatStepsReported: second?.steps ?? null,
      status
    });
  }

  const matches = rows.filter(x => x.status === "MATCH").length;
  const mismatches = rows.filter(x => x.status === "MISMATCH").length;
  const errors = rows.filter(x => x.status === "ERROR").length;
  const inconclusive = rows.filter(x => x.status === "INCONCLUSIVE").length;
  const passed = matches === rows.length;
  return {
    schema: VIBE_PROPERTY_REPORT_SCHEMA,
    intentName: intentBrief.intent.name,
    propertyKind: plan.property.kind,
    seed: plan.seed,
    sampleCount: rows.length,
    samplesSha256: digest(JSON.stringify(samples)),
    planSha256: digest(JSON.stringify(plan)),
    sourceLinkSha256: digest(JSON.stringify(link)),
    vibeSourceSha256: link.vibe.sourceSha256,
    phithonSourceSha256: link.phithon.sourceSha256,
    moduleHashes: { ...link.phithon.moduleHashes },
    matches, mismatches, errors, inconclusive,
    outcome: passed ? "ALL_SAMPLED_CHECKS_MATCH" : "SAMPLED_CHECKS_NOT_ALL_MATCHED",
    cases: rows,
    provenance: "OPERATOR_DECLARED_PROPERTY_UNATTESTED",
    executionEvidence: "LOCAL_PHISHIELD_CHILD_OUTPUT_UNATTESTED",
    exhaustiveCoverageProven: false,
    crossLanguageSemanticEquivalenceVerified: false,
    vibePreservationProven: false,
    vibeVerifierInvoked: false,
    modelRoutingApproved: false
  };
}

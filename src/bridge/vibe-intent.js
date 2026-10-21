/**
 * PhiThon R9 / Vibe intent-first interoperability.
 *
 * Grounded in Vibe phase 8.4:
 *   vibe/interchange.py :: build_intent_brief
 *   brief_version: phase-8.4.intent-brief.v1
 *
 * This module never executes Vibe, interprets .vibe syntax, compiles Python,
 * or claims cross-language semantic verification. A link is a declared
 * relationship anchored to precise source hashes only.
 */
import { analyzePackage, validateModuleRegistry } from "../language/package.js";

export const VIBE_BRIEF_VERSION = "phase-8.4.intent-brief.v1";
export const VIBE_LINK_SCHEMA = "phithon.vibe-intent-link.v1";
export const MAX_VIBE_BRIEF_BYTES = 65_536;
export const MAX_VIBE_SOURCE_BYTES = 100_000;
const SHA256 = /^[a-f0-9]{64}$/;
const ROOT_KEYS = [
  "brief_version", "source_path", "source_sha256", "intent", "preserve",
  "constraints", "bridge", "emit_target", "domain_profile", "interchange_metadata"
];
const INTENT_KEYS = ["name", "goal", "inputs", "outputs"];
const FIELD_KEYS = ["name", "type"];
const BRIDGE_KEYS = ["key", "value"];
const META_KEYS = ["source_kind", "transformation_state"];

function fail(ok, why) { if (!ok) throw new TypeError("PhiVibe: " + why); }
function object(x) { return x !== null && typeof x === "object" && !Array.isArray(x); }
function exact(obj, keys) {
  return object(obj) && Object.keys(obj).length === keys.length &&
    Object.keys(obj).every(k => keys.includes(k));
}
function safeText(x, max) {
  return typeof x === "string" && x.length <= max &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x);
}
function structuredFields(value) {
  return Array.isArray(value) && value.length <= 64 &&
    value.every(row => exact(row, FIELD_KEYS) &&
      safeText(row.name, 100) && row.name.length > 0 &&
      safeText(row.type, 100) && row.type.length > 0);
}

/** Validate Vibe's real Phase 8.4 intent brief without executing source. */
export function validateVibeBrief(brief) {
  fail(exact(brief, ROOT_KEYS), "invalid Vibe brief fields");
  fail(brief.brief_version === VIBE_BRIEF_VERSION, "unsupported Vibe brief version");
  fail((brief.source_path === null || safeText(brief.source_path, 1000)) &&
    typeof brief.source_sha256 === "string" && SHA256.test(brief.source_sha256),
    "invalid source reference/hash");
  fail(exact(brief.intent, INTENT_KEYS), "invalid intent contract");
  const { name, goal, inputs, outputs } = brief.intent;
  fail(safeText(name, 150) && name.length > 0 && safeText(goal, 4_000) &&
    structuredFields(inputs) && structuredFields(outputs), "invalid intent fields");
  fail(Array.isArray(brief.preserve) && brief.preserve.length <= 128 &&
    brief.preserve.every(x => safeText(x, 500)) &&
    Array.isArray(brief.constraints) && brief.constraints.length <= 128 &&
    brief.constraints.every(x => safeText(x, 500)), "invalid constraints");
  fail(Array.isArray(brief.bridge) && brief.bridge.length <= 128 &&
    brief.bridge.every(x => exact(x, BRIDGE_KEYS) &&
      safeText(x.key, 200) && safeText(x.value, 500)),
    "invalid bridge data");
  fail(safeText(brief.emit_target, 100) &&
    (brief.domain_profile === null || safeText(brief.domain_profile, 100)),
    "invalid emit/domain target");
  fail(exact(brief.interchange_metadata, META_KEYS) &&
    brief.interchange_metadata.source_kind === "vibe_spec" &&
    brief.interchange_metadata.transformation_state === "raw_intent_contract",
    "invalid Vibe phase-8.4 metadata");
  return brief;
}

/** Only bounded, privacy-conscious descriptive fields are shown. */
export function inspectVibeBrief(brief) {
  const v = validateVibeBrief(brief);
  return {
    schema: "phithon.vibe-intent-inspection.v1",
    intentName: v.intent.name,
    goal: v.intent.goal,
    inputs: v.intent.inputs.map(x => ({ ...x })),
    outputs: v.intent.outputs.map(x => ({ ...x })),
    preserveCount: v.preserve.length,
    constraintCount: v.constraints.length,
    bridgeCount: v.bridge.length,
    emitTarget: v.emit_target,
    sourceSha256: v.source_sha256,
    state: "DECLARED_INTENT_UNVERIFIED",
    sourceHashMatched: false,
    semanticEquivalenceVerified: false,
    authorityGranted: false
  };
}

export function inspectVibeBriefJson(raw) {
  fail(typeof raw === "string" &&
    new TextEncoder().encode(raw).byteLength <= MAX_VIBE_BRIEF_BYTES,
    "brief exceeds 64 KiB or is not text");
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new TypeError("PhiVibe: invalid JSON"); }
  return inspectVibeBrief(data);
}
async function sha256(text) {
  const crypto = globalThis.crypto?.subtle;
  fail(crypto && typeof crypto.digest === "function", "WebCrypto SHA-256 unavailable");
  const bytes = new TextEncoder().encode(text);
  const hash = new Uint8Array(await crypto.digest("SHA-256", bytes));
  return Array.from(hash, x => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Bind a Vibe Phase 8.4 brief to the exact .vibe source it describes and
 * the .phi implementation source, including hashed optional PhiPack files.
 *
 * A human must review and explicitly create this artifact. It is *not*
 * compiler/verifier output, a trust signature, or formal equivalence.
 */
export async function createVibePhiLink(brief, vibeSource, phiSource, modules = {}) {
  validateVibeBrief(brief);
  fail(typeof vibeSource === "string" && vibeSource.length > 0 &&
    new TextEncoder().encode(vibeSource).byteLength <= MAX_VIBE_SOURCE_BYTES,
    "invalid Vibe source");
  fail(typeof phiSource === "string" && phiSource.length > 0 &&
    new TextEncoder().encode(phiSource).byteLength <= MAX_VIBE_SOURCE_BYTES,
    "invalid PhiThon source");
  validateModuleRegistry(modules);
  // Parse dependency graph only, do not execute either language.
  analyzePackage(phiSource, modules);
  const vibeHash = await sha256(vibeSource);
  fail(vibeHash === brief.source_sha256, "Vibe brief source hash mismatch");
  const moduleHashes = {};
  for (const name of Object.keys(modules).sort()) {
    moduleHashes[name] = await sha256(modules[name]);
  }
  return {
    schema: VIBE_LINK_SCHEMA,
    relationship: "HUMAN_DECLARED_IMPLEMENTATION",
    vibe: { briefVersion: brief.brief_version, intentName: brief.intent.name, sourceSha256: vibeHash },
    phithon: {
      sourceSha256: await sha256(phiSource),
      moduleHashes
    },
    verification: {
      vibeBriefSourceHashMatched: true,
      phithonSyntaxAndDependencyGraphParsed: true,
      vibeVerificationPerformed: false,
      semanticEquivalenceVerified: false,
      phithonExecuted: false,
      intentPreservationProven: false
    },
    executionAuthorized: false,
    routingApproved: false,
    provenance: "OPERATOR_SELECTED_UNATTESTED"
  };
}

/** Optional check of an existing link against current byte-for-byte inputs. */
export async function verifyVibePhiLink(link, brief, vibeSource, phiSource, modules = {}) {
  if (!object(link)) return { valid: false, reason: "Invalid link" };
  try {
    const expected = await createVibePhiLink(brief, vibeSource, phiSource, modules);
    return JSON.stringify(link) === JSON.stringify(expected)
      ? { valid: true, reason: "Source hashes and declared metadata match; semantics NOT verified" }
      : { valid: false, reason: "Link metadata or source hash mismatch" };
  } catch (e) {
    return { valid: false, reason: e instanceof Error ? e.message : "Invalid input" };
  }
}

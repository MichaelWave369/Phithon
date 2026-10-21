/**
 * PhiVibe R10: source-correspondence for Vibe's existing Phase 8.4 proof brief.
 *
 * Vibe source: vibe/interchange.py :: build_proof_brief
 * Vibe output: phase-8.4.proof-brief.v1 (derived from proof artifact)
 *
 * A proof brief is user-selected, unsigned, and may be fabricated. A "passed"
 * flag is only a REPORT from Vibe; it is never PhiThon equivalence evidence.
 * No code execution, Vibe invocation, model calls, or network activity here.
 */
import { verifyVibePhiLink } from "./vibe-intent.js";
export const VIBE_PROOF_BRIEF_VERSION = "phase-8.4.proof-brief.v1";
export const VIBE_PROOF_CORRESPONDENCE_SCHEMA = "phithon.vibe-proof-correspondence.v1";
export const MAX_VIBE_PROOF_BRIEF_BYTES = 65_536;

const ROOT = ["brief_version", "proof_path", "proof_artifact_version", "source_path",
  "verification_backend", "result", "intent_summary", "preserve_constraint_summary",
  "bridge_result", "equivalence_drift_summary", "interchange_metadata"];
const INTENT = ["source_hash", "ir_hash", "emit_target", "package_context", "domain_profile", "self_hosting"];
const PRESERVE = ["obligation_summary", "obligations_sample", "obligations_total"];
const BRIDGE = ["bridge_score", "verdict", "measurement_ratio", "epsilon_metrics"];
const EQ = ["intent_equivalence_score", "drift_score", "intent_items_total", "intent_items_missing", "intent_items_unknown"];
const META = ["source_kind", "consumer_safe", "deterministic_projection", "notes"];
const SAMPLE = ["obligation_id", "category", "status", "critical"];
const RESULT = ["passed", "emission_blocked"];
const HEX = /^[0-9a-f]{64}$/;

function ensure(value, why) { if (!value) throw new TypeError("PhiVibe proof: " + why); }
function obj(x) { return x !== null && typeof x === "object" && !Array.isArray(x); }
function exact(x, keys) {
  return obj(x) && Object.keys(x).length === keys.length &&
    Object.keys(x).every(key => keys.includes(key));
}
function text(x, max = 256) {
  return typeof x === "string" && x.length <= max &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x);
}
function nullableText(x, max = 256) { return x === null || text(x, max); }
function digest(x) { return typeof x === "string" && HEX.test(x); }
function count(x) { return Number.isSafeInteger(x) && x >= 0 && x <= 1_000_000; }
function metric(x) { return x === null || (typeof x === "number" && Number.isFinite(x)); }
function opacity(x) { return obj(x) && Object.keys(x).length <= 512; }

export function validateVibeProofBrief(raw) {
  ensure(exact(raw, ROOT) && raw.brief_version === VIBE_PROOF_BRIEF_VERSION,
    "unsupported brief version or fields");
  ensure(raw.proof_artifact_version === "v1" &&
    nullableText(raw.proof_path, 1024) && nullableText(raw.source_path, 1024) &&
    text(raw.verification_backend, 128) && raw.verification_backend.length > 0,
    "invalid artifact version or path/backend metadata");
  ensure(exact(raw.result, RESULT) &&
    typeof raw.result.passed === "boolean" &&
    typeof raw.result.emission_blocked === "boolean",
    "invalid reported verification result");
  ensure(exact(raw.intent_summary, INTENT) &&
    digest(raw.intent_summary.source_hash) && digest(raw.intent_summary.ir_hash) &&
    text(raw.intent_summary.emit_target, 100) &&
    nullableText(raw.intent_summary.domain_profile, 100) &&
    opacity(raw.intent_summary.package_context) &&
    opacity(raw.intent_summary.self_hosting),
    "invalid source/IR hashes or intent metadata");
  ensure(exact(raw.preserve_constraint_summary, PRESERVE) &&
    opacity(raw.preserve_constraint_summary.obligation_summary) &&
    count(raw.preserve_constraint_summary.obligations_total) &&
    Array.isArray(raw.preserve_constraint_summary.obligations_sample) &&
    raw.preserve_constraint_summary.obligations_sample.length <= 10 &&
    raw.preserve_constraint_summary.obligations_sample.length <=
      raw.preserve_constraint_summary.obligations_total &&
    raw.preserve_constraint_summary.obligations_sample.every(row =>
      exact(row, SAMPLE) && nullableText(row.obligation_id) &&
      nullableText(row.category) && nullableText(row.status) &&
      typeof row.critical === "boolean"),
    "invalid obligation counts/sample");
  ensure(exact(raw.bridge_result, BRIDGE) &&
    metric(raw.bridge_result.bridge_score) &&
    nullableText(raw.bridge_result.verdict, 150) &&
    metric(raw.bridge_result.measurement_ratio) &&
    opacity(raw.bridge_result.epsilon_metrics), "invalid bridge summary");
  ensure(exact(raw.equivalence_drift_summary, EQ) &&
    metric(raw.equivalence_drift_summary.intent_equivalence_score) &&
    metric(raw.equivalence_drift_summary.drift_score) &&
    ["intent_items_total", "intent_items_missing", "intent_items_unknown"]
      .every(key => raw.equivalence_drift_summary[key] === null ||
        count(raw.equivalence_drift_summary[key])),
    "invalid equivalence drift metrics");
  ensure(exact(raw.interchange_metadata, META) &&
    raw.interchange_metadata.source_kind === "proof_artifact" &&
    raw.interchange_metadata.consumer_safe === true &&
    raw.interchange_metadata.deterministic_projection === true &&
    Array.isArray(raw.interchange_metadata.notes) &&
    raw.interchange_metadata.notes.length <= 16 &&
    raw.interchange_metadata.notes.every(note => text(note, 1000)),
    "invalid Vibe provenance metadata");
  return raw;
}

export function inspectVibeProofBrief(raw) {
  const value = validateVibeProofBrief(raw);
  const summary = value.preserve_constraint_summary;
  return {
    schema: "phithon.vibe-proof-inspection.v1",
    sourceSha256Claimed: value.intent_summary.source_hash,
    irSha256Claimed: value.intent_summary.ir_hash,
    backendReported: value.verification_backend,
    compilerPassReported: value.result.passed,
    emissionBlockedReported: value.result.emission_blocked,
    bridgeVerdictReported: value.bridge_result.verdict,
    bridgeScoreReported: value.bridge_result.bridge_score,
    obligationsTotalReported: summary.obligations_total,
    obligationsSampled: summary.obligations_sample.length,
    reportTrust: "OPERATOR_IMPORTED_UNATTESTED",
    originalProofArtifactChecked: false,
    originalSourceHashChecked: false,
    phithonEquivalent: false,
    executionAuthorized: false,
    routingApproved: false
  };
}
export function inspectVibeProofBriefJson(raw) {
  ensure(typeof raw === "string" &&
    new TextEncoder().encode(raw).byteLength <= MAX_VIBE_PROOF_BRIEF_BYTES,
    "proof brief not text or over 64 KiB");
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new TypeError("PhiVibe proof: invalid JSON"); }
  return inspectVibeProofBrief(data);
}

async function hashUtf8(data) {
  ensure(typeof data === "string", "hash requires text");
  const subtle = globalThis.crypto?.subtle;
  ensure(subtle && typeof subtle.digest === "function", "SHA-256 unavailable");
  const bytes = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(data)));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Two independent checks:
 * 1. R9 link matches currently supplied original .vibe/.phi/module files.
 * 2. Vibe's reported proof source hash equals the same Vibe SHA-256.
 *
 * Does NOT verify Vibe's proof artifact, that its verifier ever ran, or
 * that PhiThon implements the contract. Reports are untrusted claims.
 */
export async function createVibeProofCorrespondence(
  link, proofBrief, intentBrief, vibeSource, phiSource, modules = {}
) {
  const report = inspectVibeProofBrief(proofBrief);
  const matching = await verifyVibePhiLink(
    link, intentBrief, vibeSource, phiSource, modules
  );
  ensure(matching.valid, "R9 Vibe/PhiThon source link mismatch: " + matching.reason);
  ensure(report.sourceSha256Claimed === link.vibe.sourceSha256,
    "Vibe proof source hash differs from linked Vibe source");
  // Digest *these exact files*, but no signature/independent trust.
  return {
    schema: VIBE_PROOF_CORRESPONDENCE_SCHEMA,
    relationship: "PROOF_REPORT_TO_SOURCE_LINK_DECLARED",
    vibeSourceSha256: link.vibe.sourceSha256,
    phithonSourceSha256: link.phithon.sourceSha256,
    proofBriefSha256: await hashUtf8(JSON.stringify(proofBrief)),
    vibeLinkSha256: await hashUtf8(JSON.stringify(link)),
    report: {
      backendReported: report.backendReported,
      compilerPassReported: report.compilerPassReported,
      emissionBlockedReported: report.emissionBlockedReported,
      bridgeVerdictReported: report.bridgeVerdictReported,
      bridgeScoreReported: report.bridgeScoreReported,
      obligationsTotalReported: report.obligationsTotalReported
    },
    checks: {
      vibeBriefAndProofHashesMatchSuppliedSource: true,
      phithonSourceAndPackageHashesMatchSavedLink: true,
      proofArtifactCryptographicallyAuthenticated: false,
      vibeVerifierExecutionAttested: false,
      vibeProofClaimsIndependentlyVerified: false,
      crossLanguageSemanticEquivalenceVerified: false,
      phithonExecuted: false
    },
    provenance: "UNATTESTED_OPERATOR_SELECTED_REPORT",
    canExecute: false,
    mayApproveModel: false,
    canPromoteLedgerAuthority: false
  };
}

/** An offline drift check over current supplied sources and report metadata. */
export async function verifyVibeProofCorrespondence(
  record, link, proofBrief, intentBrief, vibeSource, phiSource, modules = {}
) {
  try {
    const rebuilt = await createVibeProofCorrespondence(
      link, proofBrief, intentBrief, vibeSource, phiSource, modules
    );
    return JSON.stringify(record) === JSON.stringify(rebuilt)
      ? { valid: true, reason: "Source/report correspondence matches; Vibe results remain unauthenticated" }
      : { valid: false, reason: "Correspondence fields, reported result, or source hash changed" };
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : "Invalid correspondence" };
  }
}

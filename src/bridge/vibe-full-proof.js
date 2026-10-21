/**
 * PhiVibe R14: read only the FULL Vibe v1 .vibe.proof.json obligation array.
 * Grounded in Vibe/vibe/proof.py (build_proof_artifact, VerificationObligation).
 * No compiler invocation, signature verification, model calls, or execution.
 */
import { createHash } from "node:crypto";
import { validateVibeProofBrief } from "./vibe-proof.js";
import { buildVibeObligationLedger, validateVibeObligationBindings } from "./vibe-obligations.js";

export const VIBE_FULL_LEDGER_SCHEMA = "phithon.vibe-full-obligation-evidence.v1";
export const MAX_VIBE_FULL_PROOF_BYTES = 2_097_152;
export const MAX_VIBE_FULL_OBLIGATIONS = 512;
const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_.:-]{1,256}$/;
const obj = x => x !== null && typeof x === "object" && !Array.isArray(x);
const exact = (x, keys) => obj(x) && Object.keys(x).length === keys.length &&
  Object.keys(x).every(k => keys.includes(k));
const digest = x => createHash("sha256").update(JSON.stringify(x),"utf8").digest("hex");
function ensure(x, why) { if (!x) throw new TypeError("PhiVibe full proof: " + why); }
function text(x, max=256) {
  return typeof x === "string" && x.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(x);
}
function nullableText(x, max=256) { return x === null || text(x,max); }
const FIELDS = [
  "obligation_id","category","description","source_location",
  "status","evidence","critical"
];
/**
 * Validate upstream proof v1's stable obligational fields. Full Vibe artifacts
 * legitimately contain dozens of OTHER metadata fields; never copy them.
 * Accepts empty arrays: zero obligations is a complete zero-entry inventory.
 */
export function extractFullVibeObligations(proof, brief) {
  validateVibeProofBrief(brief);
  ensure(obj(proof) &&
    proof.artifact_version === "v1" && proof.schema_version === "v1" &&
    typeof proof.source_hash === "string" && SHA256.test(proof.source_hash) &&
    proof.source_hash === brief.intent_summary.source_hash &&
    typeof proof.ir_hash === "string" && SHA256.test(proof.ir_hash) &&
    proof.ir_hash === brief.intent_summary.ir_hash &&
    text(proof.verification_backend,128) &&
    proof.verification_backend === brief.verification_backend &&
    text(proof.emit_target,100) &&
    proof.emit_target === brief.intent_summary.emit_target &&
    exact(proof.result, ["passed","emission_blocked"]) &&
    typeof proof.result.passed === "boolean" &&
    typeof proof.result.emission_blocked === "boolean" &&
    proof.result.passed === brief.result.passed &&
    proof.result.emission_blocked === brief.result.emission_blocked,
    "proof v1 provenance, hashes or result differs from the supplied brief");
  ensure(Array.isArray(proof.obligations) &&
    proof.obligations.length <= MAX_VIBE_FULL_OBLIGATIONS &&
    proof.obligations.length === brief.preserve_constraint_summary.obligations_total,
    "full obligation count differs from proof brief, or exceeds 512");
  const names=new Set();
  const rows = proof.obligations.map((entry, i) => {
    ensure(exact(entry,FIELDS) &&
      typeof entry.obligation_id === "string" && ID.test(entry.obligation_id) &&
      text(entry.category) && text(entry.status) &&
      text(entry.description, 4000) && nullableText(entry.source_location, 1000) &&
      nullableText(entry.evidence, 4000) && typeof entry.critical === "boolean",
      "unexpected/unsafe obligation record at index "+i);
    ensure(!names.has(entry.obligation_id), "ambiguous duplicate obligation ID");
    names.add(entry.obligation_id);
    return {obligation_id:entry.obligation_id, category:entry.category,
      status:entry.status,critical:entry.critical};
  });
  // Vibe's build_proof_brief takes the FIRST TEN obligation entries, in order.
  const sample=brief.preserve_constraint_summary.obligations_sample;
  ensure(sample.length === Math.min(10, rows.length),
    "proof brief sample length differs from Vibe's first-ten projection");
  for(let i=0;i<sample.length;i++){
    ensure(exact(sample[i], ["obligation_id","category","status","critical"]) &&
      JSON.stringify(sample[i]) === JSON.stringify(rows[i]),
      "proof brief first-ten obligation differs from original proof at "+i);
  }
  return rows;
}
export function parseFullVibeProofJson(raw, brief) {
  ensure(typeof raw === "string" &&
    Buffer.byteLength(raw,"utf8") <= MAX_VIBE_FULL_PROOF_BYTES,
    "proof must be bounded JSON <= 2 MiB");
  let value;
  try { value=JSON.parse(raw); }
  catch { throw new TypeError("PhiVibe full proof: invalid JSON"); }
  return extractFullVibeObligations(value,brief);
}

/** Source hashes, sample projection and all references are checked again. */
export async function buildFullVibeObligationLedger({
  fullProof, link, intentBrief, proofBrief, correspondence, vibeSource,
  phiSource, modules={}, behaviorReport, propertyReport, bindings
}) {
  const fullObligations = extractFullVibeObligations(fullProof,proofBrief);
  // Reuses R13's complete R9/R10 correspondence and R11/R12 report checks.
  validateVibeObligationBindings(bindings, proofBrief, fullObligations);
  const ledger=await buildVibeObligationLedger({
    link,intentBrief,proofBrief,correspondence,vibeSource,phiSource,modules,
    behaviorReport,propertyReport,bindings,fullObligations
  });
  ensure(ledger.obligationsOmittedFromProofSample===0,
    "incomplete full inventory mapping");
  const {
    schema:_legacySchema,
    obligationsInProofSample:_misnamedCount,
    obligationsOmittedFromProofSample:_misnamedOmissions,
    ...safe
  }=ledger;
  return {
    schema:VIBE_FULL_LEDGER_SCHEMA,
    ...safe,
    obligationsInFullArtifact:fullObligations.length,
    obligationsInCompactBrief:proofBrief.preserve_constraint_summary.obligations_sample.length,
    obligationsMissingFromFullArtifact:0,
    fullObligationProjectionSha256:digest(fullObligations),
    fullProofJsonSha256:digest(fullProof),
    inventorySource:"OPERATOR_SELECTED_ORIGINAL_VIBE_V1_PROOF_UNATTESTED",
    inventorySourceHashCrossChecked:true,
    compactSampleCrossChecked:true,
    fullInventoryAuthenticated:false,
    ...{
      reportsIndependentlyAuthenticated:false,
      evidenceExecutionIndependentlyAttested:false,
      semanticCoverageEstablished:false,
      intentPreservationProven:false,
      crossLanguageEquivalenceVerified:false,
      modelRoutingApproved:false
    }
  };
}

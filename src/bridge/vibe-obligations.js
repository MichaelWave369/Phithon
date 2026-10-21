/**
 * PhiVibe R13: cross-reference operator-selected R11/R12 observations with
 * up to ten obligation summaries actually exported by Vibe Phase 8.4.
 *
 * Read-only. Vibe's brief has a SAMPLED list, not a complete obligation
 * inventory. Reported outcome != an authenticated execution or proof.
 */
import { createHash } from "node:crypto";
import { validateVibeProofBrief, verifyVibeProofCorrespondence } from "./vibe-proof.js";
import { validateVibeBrief } from "./vibe-intent.js";
import { VIBE_BEHAVIOR_REPORT_SCHEMA } from "./vibe-behavior.js";
import { VIBE_PROPERTY_REPORT_SCHEMA } from "./vibe-properties.js";
import { validateModuleRegistry } from "../language/package.js";

export const VIBE_OBLIGATION_BINDINGS_SCHEMA = "phithon.vibe-obligation-bindings.v1";
export const VIBE_OBLIGATION_LEDGER_SCHEMA = "phithon.vibe-obligation-evidence.v1";
export const MAX_VIBE_OBLIGATION_BINDINGS_BYTES = 8192;
const SHA = /^[0-9a-f]{64}$/;
const NAME = /^[A-Za-z0-9_.:-]{1,256}$/;
const bool = x => typeof x === "boolean";
const obj = x => x !== null && typeof x === "object" && !Array.isArray(x);
const same = (o, names) => obj(o) && Object.keys(o).length === names.length &&
  Object.keys(o).every(k => names.includes(k));
const hash = value => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
const sumStatus = (cases, kind) => {
  const states = kind === "behavior" ? ["MATCH","MISMATCH","ERROR"] :
    ["MATCH","MISMATCH","ERROR","INCONCLUSIVE"];
  return states.map(status => cases.filter(x => x.status === status).length);
};
function requireOk(ok, why) { if (!ok) throw new TypeError("PhiVibe obligations: " + why); }
function validDigest(value) { return typeof value === "string" && SHA.test(value); }
function finiteCount(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 12; }

export function validateVibeObligationBindings(mapping, proof, fullObligations = null) {
  validateVibeProofBrief(proof);
  requireOk(same(mapping, ["schema","provenance","bindings"]) &&
    mapping.schema === VIBE_OBLIGATION_BINDINGS_SCHEMA &&
    mapping.provenance === "OPERATOR_CHOSEN_ASSOCIATION_UNATTESTED" &&
    Array.isArray(mapping.bindings) && mapping.bindings.length <=
      (fullObligations === null ? 10 : 512),
    "invalid binding manifest");
  const sample = fullObligations ?? proof.preserve_constraint_summary.obligations_sample;
  requireOk(Array.isArray(sample) && sample.length <= 512, "invalid obligation inventory");
  const ids = sample.map(x => x.obligation_id);
  // Ambiguous/null IDs from upstream cannot be safely identified here.
  requireOk(ids.every(x => typeof x === "string" && NAME.test(x)) &&
    new Set(ids).size === ids.length, "Vibe proof sample has absent/ambiguous obligation ids");
  const seen = new Set();
  for (const row of mapping.bindings) {
    requireOk(same(row, ["obligationId","evidence"]) &&
      ids.includes(row.obligationId) && !seen.has(row.obligationId) &&
      Array.isArray(row.evidence) && row.evidence.length >= 1 &&
      row.evidence.length <= 12, "unknown/duplicate obligation or invalid binding");
    seen.add(row.obligationId);
    const unique = new Set();
    for (const evidence of row.evidence) {
      const b = same(evidence, ["type","caseId"]) && evidence.type === "behavior" &&
        typeof evidence.caseId === "string" && /^[a-z][a-z0-9_-]{0,39}$/.test(evidence.caseId);
      const p = same(evidence, ["type","sampleIndex"]) && evidence.type === "property" &&
        Number.isInteger(evidence.sampleIndex) && evidence.sampleIndex >= 1 &&
        evidence.sampleIndex <= 12;
      requireOk(b || p, "unknown or malformed evidence reference");
      const key = JSON.stringify(evidence);
      requireOk(!unique.has(key), "duplicate evidence reference");
      unique.add(key);
    }
  }
  return mapping;
}
export function parseVibeObligationBindingsJson(source, proof) {
  requireOk(typeof source === "string" &&
    Buffer.byteLength(source, "utf8") <= MAX_VIBE_OBLIGATION_BINDINGS_BYTES,
    "binding input must be bounded JSON under 8 KiB");
  let value;
  try { value = JSON.parse(source); }
  catch { throw new TypeError("PhiVibe obligations: invalid JSON"); }
  return validateVibeObligationBindings(value, proof);
}
function checkReportLink(report, link, kind) {
  const isBehavior = kind === "behavior";
  const expectedSchema = isBehavior ? VIBE_BEHAVIOR_REPORT_SCHEMA : VIBE_PROPERTY_REPORT_SCHEMA;
  requireOk(obj(report) && report.schema === expectedSchema &&
    report.vibeSourceSha256 === link.vibe.sourceSha256 &&
    report.phithonSourceSha256 === link.phithon.sourceSha256 &&
    report.sourceLinkSha256 === hash(link) &&
    JSON.stringify(report.moduleHashes) === JSON.stringify(link.phithon.moduleHashes),
    "stale or incompatible " + kind + " report source link");
  const countKey = isBehavior ? "caseCount" : "sampleCount";
  requireOk(Number.isInteger(report[countKey]) && report[countKey] >= 1 &&
    report[countKey] <= (isBehavior ? 8 : 12) &&
    Array.isArray(report.cases) && report.cases.length === report[countKey] &&
    ["matches","mismatches","errors"].every(k => finiteCount(report[k])) &&
    (isBehavior ? true : finiteCount(report.inconclusive)), "invalid " + kind + " case totals");
  const [matches,mismatches,errors,inconclusive] = sumStatus(report.cases,kind);
  requireOk(matches === report.matches && mismatches === report.mismatches &&
    errors === report.errors && (isBehavior || inconclusive === report.inconclusive),
    "inconsistent " + kind + " case counts");
  requireOk(report.cases.every((row,i) =>
    obj(row) && (isBehavior ?
      ["MATCH","MISMATCH","ERROR"].includes(row.status) :
      ["MATCH","MISMATCH","ERROR","INCONCLUSIVE"].includes(row.status)) &&
    (isBehavior ?
      typeof row.id === "string" && /^[a-z][a-z0-9_-]{0,39}$/.test(row.id) :
      row.index === i + 1) &&
    validDigest(row.inputSha256) &&
    validDigest(isBehavior ? row.harnessSourceSha256 : row.harnessSha256) &&
    ((isBehavior ? row.observedOutputSha256 : row.observedSha256) === null ||
      validDigest(isBehavior ? row.observedOutputSha256 : row.observedSha256)) &&
    (row.status !== "MATCH" ||
      validDigest(isBehavior ? row.observedOutputSha256 : row.observedSha256))),
    "invalid case id/hash in " + kind + " report");
  if(isBehavior) {
    requireOk(new Set(report.cases.map(row => row.id)).size === report.caseCount &&
      report.provenance === "OPERATOR_SELECTED_EXPECTATIONS_UNATTESTED" &&
      report.executionEvidence === "LOCAL_PHISHIELD_CHILD_OUTPUT_UNATTESTED" &&
      report.intentPreservationProven === false &&
      report.semanticEquivalenceVerified === false &&
      report.exhaustiveCoverageProven === false &&
      report.vibeVerifierRun === false &&
      report.executionAuthorizedOutsideRunner === false &&
      report.modelRoutingApproved === false &&
      validDigest(report.vectorManifestSha256), "behavior provenance or flags invalid");
  } else {
    requireOk(report.provenance === "OPERATOR_DECLARED_PROPERTY_UNATTESTED" &&
      report.executionEvidence === "LOCAL_PHISHIELD_CHILD_OUTPUT_UNATTESTED" &&
      report.exhaustiveCoverageProven === false &&
      report.crossLanguageSemanticEquivalenceVerified === false &&
      report.vibePreservationProven === false &&
      report.vibeVerifierInvoked === false &&
      report.modelRoutingApproved === false &&
      validDigest(report.planSha256) && validDigest(report.samplesSha256),
      "property provenance or flags invalid");
  }
  requireOk(report.outcome === (
    matches === report[countKey] ? (isBehavior ? "ALL_SELECTED_CASES_MATCH" : "ALL_SAMPLED_CHECKS_MATCH") :
    (isBehavior ? "SELECTED_CASES_NOT_ALL_MATCHED" : "SAMPLED_CHECKS_NOT_ALL_MATCHED")
  ), "contradictory " + kind + " reported outcome");
}
export async function buildVibeObligationLedger({
  link, intentBrief, proofBrief, correspondence, vibeSource, phiSource,
  modules = {}, behaviorReport, propertyReport, bindings, fullObligations = null
}) {
  validateVibeBrief(intentBrief);
  validateVibeProofBrief(proofBrief);
  validateModuleRegistry(modules);
  validateVibeObligationBindings(bindings, proofBrief, fullObligations);
  const checked = await verifyVibeProofCorrespondence(
    correspondence, link, proofBrief, intentBrief, vibeSource, phiSource, modules
  );
  requireOk(checked.valid, "proof correspondence source mismatch: " + checked.reason);
  checkReportLink(behaviorReport, link, "behavior");
  checkReportLink(propertyReport, link, "property");
  requireOk(behaviorReport.intentName === intentBrief.intent.name &&
    propertyReport.intentName === intentBrief.intent.name,
    "behavior/property report intent mismatch");

  const bindingsById = new Map(bindings.bindings.map(x => [x.obligationId,x.evidence]));
  const b = new Map(behaviorReport.cases.map(x => [x.id,x]));
  const p = new Map(propertyReport.cases.map(x => [x.index,x]));
  const sourceRows = fullObligations ?? proofBrief.preserve_constraint_summary.obligations_sample;
  const rows = sourceRows.map((entry,index) => {
    const refs = bindingsById.get(entry.obligation_id) ?? [];
    const observations = refs.map(ref => {
      const observed = ref.type === "behavior" ? b.get(ref.caseId) : p.get(ref.sampleIndex);
      requireOk(observed, "reference missing in " + ref.type + " report");
      return {
        type: ref.type,
        evidenceId: ref.type === "behavior" ? ref.caseId : String(ref.sampleIndex),
        reportedStatus: observed.status,
        observationSha256: ref.type === "behavior" ?
          observed.observedOutputSha256 : observed.observedSha256
      };
    });
    const hasError = observations.some(x => x.reportedStatus === "ERROR" ||
      x.reportedStatus === "INCONCLUSIVE");
    const hasMismatch = observations.some(x => x.reportedStatus === "MISMATCH");
    const status = observations.length === 0 ? "NO_ASSOCIATION" :
      hasError ? "INCOMPLETE_OR_ERROR" :
      hasMismatch ? "REPORTED_MISMATCH" : "REPORTED_SAMPLE_MATCHES";
    return {
      sampleIndex:index + 1,
      obligationId:entry.obligation_id,
      category:entry.category,
      vibeReportedStatus:entry.status,
      vibeReportedCritical:entry.critical,
      associationStatus:status,
      evidence:observations
    };
  });
  const omitted = proofBrief.preserve_constraint_summary.obligations_total - rows.length;
  return {
    schema:VIBE_OBLIGATION_LEDGER_SCHEMA,
    intentName:intentBrief.intent.name,
    sourceLinkSha256:hash(link),
    proofCorrespondenceSha256:hash(correspondence),
    proofBriefSha256:hash(proofBrief),
    behaviorReportSha256:hash(behaviorReport),
    propertyReportSha256:hash(propertyReport),
    bindingManifestSha256:hash(bindings),
    vibeSourceSha256:link.vibe.sourceSha256,
    phithonSourceSha256:link.phithon.sourceSha256,
    obligationsTotalReported:proofBrief.preserve_constraint_summary.obligations_total,
    obligationsInProofSample:rows.length,
    obligationsOmittedFromProofSample:omitted,
    associatedSampledObligations:rows.filter(x=>x.associationStatus !== "NO_ASSOCIATION").length,
    unresolvedSampledObligations:rows.filter(x=>x.associationStatus !== "REPORTED_SAMPLE_MATCHES").length,
    rows,
    provenance:"OPERATOR_CHOSEN_ASSOCIATION_UNATTESTED",
    reportsIndependentlyAuthenticated:false,
    evidenceExecutionIndependentlyAttested:false,
    semanticCoverageEstablished:false,
    intentPreservationProven:false,
    crossLanguageEquivalenceVerified:false,
    modelRoutingApproved:false
  };
}

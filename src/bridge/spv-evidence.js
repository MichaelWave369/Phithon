/**
 * PhiBridge R8: a read-only compatibility reader for SuperPhiVessel's
 * portable, redacted Local Evidence Bench v0.1 JSON export.
 *
 * Grounded in SuperPhiVessel:
 * packages/vessie-local-console/ui/portable-bench.mjs
 *
 * This module contains no network, model dispatch, file access, signing,
 * routing, or execution. Exported evidence is UNATTESTED and grants nothing.
 */
export const SPV_BENCH_SCHEMA = "superphivessel.local-console.evidence-bench.bundle.v0.1";
export const SPV_BENCH_MAX_BYTES = 65_536;
const PERF = "PERFORMANCE_RECEIPT";
const REVIEW = "HUMAN_REVIEW";
const PROTOCOLS = new Set(["governance-one-sentence-v1", "logic-steps-v1", "code-bug-v1"]);
const RATINGS = new Set(["1", "2", "3", "4", "5", "NOT_ASSESSED"]);
const COMPLETENESS = new Set(["APPEARS_COMPLETE", "POSSIBLY_CUT_OFF", "UNSURE"]);
const VERIFICATION = new Set(["NOT_CHECKED", "OPERATOR_CHECKED_SUPPORTED", "OPERATOR_CHECKED_CONTRADICTED"]);
const STOP_REASONS = new Set(["stop", "length", "UNREPORTED_OR_UNKNOWN"]);

const BUNDLE_FIELDS = [
  "schema", "created_at", "scope", "source_trust", "max_entries",
  "evidence_count", "entries", "prompt_included", "generated_text_included",
  "free_text_notes_included", "automatic_ranking_performed",
  "quality_gate_approved", "model_routing_approved",
  "cloud_execution_approved", "authority_granted"
];
const SHARED = [
  "kind", "model", "output_sha256", "observed_at", "provenance",
  "prompt_included", "generated_text_included", "authority_granted"
];
const PERF_FIELDS = [
  ...SHARED, "trial_elapsed_ms", "model_load_ns", "prompt_eval_ns",
  "generation_eval_ns", "generated_tokens", "prompt_tokens",
  "token_cap_requested", "token_cap_reached", "stop_reason"
];
const REVIEW_FIELDS = [
  ...SHARED, "helpfulness", "completeness", "verification"
];

function requireValue(condition, code) {
  if (!condition) throw new TypeError("PhiBridge: " + code);
}
function exactKeys(obj, keys) {
  return obj !== null && typeof obj === "object" && !Array.isArray(obj) &&
    Object.keys(obj).length === keys.length &&
    Object.keys(obj).every(key => keys.includes(key));
}
function iso(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}
function modelLabel(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 128 &&
    !/[\u0000-\u001f\u007f]/.test(value);
}
function hash(value) { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function nullableInt(value) { return value === null || (Number.isSafeInteger(value) && value >= 0); }
function noAuthority(record) {
  return record.prompt_included === false &&
    record.generated_text_included === false &&
    record.authority_granted === false;
}
function identity(entry) {
  return JSON.stringify([entry.kind, entry.model, entry.output_sha256, entry.observed_at]);
}
function validateEntry(entry) {
  requireValue(entry && typeof entry === "object" && !Array.isArray(entry), "ENTRY_OBJECT_REQUIRED");
  const isPerf = entry.kind === PERF;
  const isReview = entry.kind === REVIEW;
  requireValue(
    isPerf
      ? exactKeys(entry, PERF_FIELDS) || exactKeys(entry, [...PERF_FIELDS, "protocol_id"])
      : isReview && exactKeys(entry, REVIEW_FIELDS),
    "ENTRY_FIELDS_INVALID"
  );
  requireValue(modelLabel(entry.model) && hash(entry.output_sha256) &&
    iso(entry.observed_at) && noAuthority(entry), "ENTRY_PRIVACY_OR_IDENTITY_INVALID");
  if (isPerf) {
    requireValue(entry.provenance === "IMPORTED_OR_OPERATOR_CAPTURED_UNATTESTED" &&
      ["trial_elapsed_ms", "model_load_ns", "prompt_eval_ns", "generation_eval_ns",
        "generated_tokens", "prompt_tokens"].every(name => nullableInt(entry[name])) &&
      Number.isInteger(entry.token_cap_requested) &&
      entry.token_cap_requested >= 1 && entry.token_cap_requested <= 128 &&
      typeof entry.token_cap_reached === "boolean" &&
      STOP_REASONS.has(entry.stop_reason), "PERFORMANCE_DATA_INVALID");
    requireValue(entry.protocol_id === undefined || entry.protocol_id === null ||
      PROTOCOLS.has(entry.protocol_id), "PROTOCOL_ID_INVALID");
  } else {
    requireValue(entry.provenance === "OPERATOR_SELF_REPORT_UNATTESTED" &&
      RATINGS.has(entry.helpfulness) && COMPLETENESS.has(entry.completeness) &&
      VERIFICATION.has(entry.verification), "HUMAN_REVIEW_INVALID");
  }
  return entry;
}

/**
 * Pure validation: rejects all injected fields and duplicate identities.
 * It neither executes supplied code nor vouches for the truth of a report.
 */
export function validateSpvBench(raw) {
  requireValue(exactKeys(raw, BUNDLE_FIELDS), "BUNDLE_FIELDS_INVALID");
  requireValue(raw.schema === SPV_BENCH_SCHEMA && iso(raw.created_at) &&
    raw.scope === "OPERATOR_CHOSEN_PORTABLE_REDACTED" &&
    raw.source_trust === "UNATTESTED_OPERATOR_SELECTED_JSON" &&
    raw.max_entries === 24 && Number.isInteger(raw.evidence_count) &&
    raw.evidence_count >= 1 && raw.evidence_count <= 24 &&
    Array.isArray(raw.entries) && raw.entries.length === raw.evidence_count,
    "BUNDLE_HEADER_INVALID");
  requireValue(raw.prompt_included === false &&
    raw.generated_text_included === false &&
    raw.free_text_notes_included === false &&
    raw.automatic_ranking_performed === false &&
    raw.quality_gate_approved === false &&
    raw.model_routing_approved === false &&
    raw.cloud_execution_approved === false &&
    raw.authority_granted === false, "BUNDLE_AUTHORITY_INVALID");

  const seen = new Set();
  for (const entry of raw.entries) {
    validateEntry(entry);
    const key = identity(entry);
    requireValue(!seen.has(key), "BUNDLE_DUPLICATE_ENTRY");
    seen.add(key);
  }
  return raw;
}

/**
 * Read a source file selected by the user. The return value contains no raw
 * prompt, answer, output SHA-256, URL, cookie or private notes.
 * Only operator-reported measurements are represented, never ranked.
 */
export function inspectSpvBench(raw, { showModelNames = false } = {}) {
  const bench = validateSpvBench(raw);
  const perf = bench.entries.filter(e => e.kind === PERF);
  const reviews = bench.entries.filter(e => e.kind === REVIEW);
  const paired = new Set(reviews.map(e => JSON.stringify([e.model, e.output_sha256])));
  const models = new Set(bench.entries.map(e => e.model));
  const rows = perf.map(e => ({
    observedAt: e.observed_at,
    model: showModelNames === true ? e.model : "REDACTED",
    protocolId: e.protocol_id ?? null,
    generatedTokens: e.generated_tokens,
    elapsedWallMs: e.trial_elapsed_ms,
    matchingHumanReviewPresent: paired.has(JSON.stringify([e.model, e.output_sha256])),
    provenance: "UNATTESTED"
  })).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  return {
    schema: "phithon.spv-evidence-inspection.v1",
    inputSchema: SPV_BENCH_SCHEMA,
    sourceTrust: "UNATTESTED_OPERATOR_SELECTED_JSON",
    evidenceCount: bench.evidence_count,
    performanceCount: perf.length,
    humanReviewCount: reviews.length,
    modelLabelCount: models.size,
    performanceRowsWithMatchingReview: rows.filter(r => r.matchingHumanReviewPresent).length,
    rows,
    rankingPerformed: false,
    inferencePerformed: false,
    authorityGranted: false,
    routingApproved: false,
    executionAuthorized: false,
    status: "READ_ONLY_UNATTESTED_IMPORT"
  };
}

export function inspectSpvBenchJson(source, options = {}) {
  requireValue(typeof source === "string" &&
    new TextEncoder().encode(source).byteLength <= SPV_BENCH_MAX_BYTES,
    "BUNDLE_TOO_LARGE");
  let parsed;
  try { parsed = JSON.parse(source); }
  catch { throw new TypeError("PhiBridge: INVALID_JSON"); }
  return inspectSpvBench(parsed, options);
}

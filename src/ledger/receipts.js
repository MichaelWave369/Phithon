import { analyzePackage, validateModuleRegistry } from "../language/package.js";

/**
 * PhiLedger R2 - portable SHA-256 integrity receipts for PhiThon executions.
 *
 * NOT A SIGNATURE, timestamp authority, proof of execution, or identity claim.
 * A hash proves internal integrity only against a previously trusted digest.
 * Anyone with the contents can create another internally valid receipt.
 *
 * The verifier checks schema, input bounds, normalized shape, source hash,
 * every event link, the transcript/output, and the final receipt hash.
 */
export const RECEIPT_SCHEMA = "phithon.execution-receipt.v1";
export const PACKAGE_RECEIPT_SCHEMA = "phithon.execution-receipt.v2";
const ALGORITHM = "SHA-256";
const MAX_RECEIPT_CHARS = 750_000;

function ensure(test, message) {
  if (!test) throw new TypeError("PhiLedger: " + message);
}

function exactKeys(value, keys, path) {
  ensure(value !== null && typeof value === "object" && !Array.isArray(value), path + " must be an object");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  ensure(actual.length === expected.length && actual.every((k, i) => k === expected[i]), path + " has unexpected or missing fields");
}

function canonical(value, depth = 0) {
  ensure(depth <= 16, "Receipt exceeds maximum nesting depth");
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    ensure(Number.isFinite(value), "Receipt cannot contain nonfinite values");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    ensure(value.length <= 15000, "Receipt array exceeds size limit");
    return "[" + value.map(x => canonical(x, depth + 1)).join(",") + "]";
  }
  ensure(value !== null && typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), "Receipt contains unsupported data");
  const keys = Object.keys(value).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonical(value[k], depth + 1)).join(",") + "}";
}

async function digest(text) {
  ensure(typeof text === "string", "Hash input must be a string");
  const subtle = globalThis.crypto?.subtle;
  ensure(subtle && typeof subtle.digest === "function", "WebCrypto SHA-256 is unavailable");
  const bytes = new TextEncoder().encode(text);
  const hash = new Uint8Array(await subtle.digest("SHA-256", bytes));
  return Array.from(hash, x => x.toString(16).padStart(2, "0")).join("");
}

function validateSourceAndResult(source, execution) {
  ensure(typeof source === "string" && source.length <= 100_000, "Invalid program source");
  exactKeys(execution, ["output", "result", "steps"], "execution");
  ensure(Array.isArray(execution.output) && execution.output.length <= 15000, "Invalid output array");
  ensure(execution.output.every(x => typeof x === "string"), "Output contains a non-string");
  ensure(execution.output.reduce((n, x) => n + x.length, 0) <= 50_000, "Output is too large");
  ensure(typeof execution.result === "string" && execution.result.length <= 100_000, "Invalid result");
  ensure(Number.isInteger(execution.steps) && execution.steps >= 0 && execution.steps <= 500_000, "Invalid execution steps");
}

function validateEvent(event, index) {
  exactKeys(event, ["sequence", "event", "data", "provenance"], "event " + (index + 1));
  ensure(event.sequence === index + 1, "Events must have sequential IDs starting at 1");
  ensure(typeof event.event === "string" && event.event.length <= 120, "Invalid event label");
  ensure(typeof event.data === "string" && event.data.length <= 200_000, "Invalid event data");
  ensure(event.provenance === "SIMULATED", "R2 only accepts SIMULATED execution events");
}

/** Create a fresh, hash-chained, portable execution receipt. */
export async function createReceipt(source, execution, options = {}) {
  ensure(execution !== null && typeof execution === "object", "Missing execution");
  const { output, result, steps, ledger } = execution;
  const info = { output, result, steps };
  validateSourceAndResult(source, info);
  ensure(Array.isArray(ledger) && ledger.length <= 1000, "Invalid ledger list");
  ledger.forEach(validateEvent);
  ensure(ledger.reduce((n, x) => n + x.data.length + x.event.length, 0) <= 200_000, "Too many ledger characters");

  const createdAt = options.createdAt ?? new Date().toISOString();
  ensure(typeof createdAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt) && !Number.isNaN(Date.parse(createdAt)), "Invalid receipt timestamp");
  const sourceHash = await digest(source);
  const header = { schema: RECEIPT_SCHEMA, algorithm: ALGORITHM, createdAt, sourceHash, execution: info };
  const genesisHash = await digest(canonical(header));
  const events = [];
  let previousHash = genesisHash;

  for (const entry of ledger) {
    const payload = {
      sequence: entry.sequence,
      event: entry.event,
      data: entry.data,
      provenance: entry.provenance,
      previousHash
    };
    const hash = await digest(canonical(payload));
    events.push({ ...payload, hash });
    previousHash = hash;
  }

  const body = {
    ...header,
    source,
    genesisHash,
    events,
    headHash: previousHash
  };
  const receiptHash = await digest(canonical(body));
  const receipt = { ...body, receiptHash };
  ensure(JSON.stringify(receipt).length <= MAX_RECEIPT_CHARS, "Receipt too large");
  return receipt;
}

/**
 * Reconstruct the exact canonical receipt and compare all fields.
 * Valid means self-consistent and unmodified *relative to its claimed hash*.
 * It does not authenticate the creator, attest execution, or prove a timestamp.
 */
async function verifyLegacyReceipt(receipt) {
  try {
    exactKeys(receipt, ["schema", "algorithm", "createdAt", "sourceHash", "execution", "source", "genesisHash", "events", "headHash", "receiptHash"], "receipt");
    ensure(receipt.schema === RECEIPT_SCHEMA, "Unsupported receipt schema");
    ensure(receipt.algorithm === ALGORITHM, "Unsupported digest algorithm");
    ensure(JSON.stringify(receipt).length <= MAX_RECEIPT_CHARS, "Receipt too large");
    ensure(Array.isArray(receipt.events) && receipt.events.length <= 1000, "Invalid event chain");

    const ledger = receipt.events.map((e, index) => {
      exactKeys(e, ["sequence", "event", "data", "provenance", "previousHash", "hash"], "event " + (index + 1));
      const { sequence, event, data, provenance, previousHash, hash } = e;
      ensure(typeof previousHash === "string" && /^[a-f0-9]{64}$/.test(previousHash), "Invalid previous event digest");
      ensure(typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash), "Invalid event digest");
      return { sequence, event, data, provenance };
    });

    const reconstructed = await createReceipt(receipt.source, { ...receipt.execution, ledger }, { createdAt: receipt.createdAt });
    const ok = canonical(reconstructed) === canonical(receipt);
    return ok
      ? { valid: true, reason: "SHA-256 chain and transcript match", headHash: receipt.headHash, receiptHash: receipt.receiptHash, events: receipt.events.length }
      : { valid: false, reason: "Hash or transcript mismatch" };
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : "Invalid receipt" };
  }
}


/**
 * PhiLedger R5: a source-complete receipt for PhiPack programs.
 *
 * This v2 schema commits to ALL module source text in the local registry,
 * including transitive and unused declared modules, with a canonical set hash.
 * It is a self-consistent integrity record, NOT an authentication mechanism.
 */
export async function createPackageReceipt(source, execution, modules, options = {}) {
  const names = validateModuleRegistry(modules);
  ensure(names.length > 0, "Package receipt requires at least one module");
  // Static dependency checks only; never executes the imported code.
  analyzePackage(source, modules);

  // Reuse v1's strict transcript, event, and timestamp validation.
  const validated = await createReceipt(source, execution, options);
  const moduleSources = {};
  const moduleHashes = {};
  for (const name of [...names].sort()) {
    moduleSources[name] = modules[name];
    moduleHashes[name] = await digest(modules[name]);
  }
  const moduleSetHash = await digest(canonical(moduleHashes));
  const header = {
    schema: PACKAGE_RECEIPT_SCHEMA,
    algorithm: ALGORITHM,
    createdAt: validated.createdAt,
    sourceHash: validated.sourceHash,
    moduleSetHash,
    execution: validated.execution
  };
  const genesisHash = await digest(canonical(header));
  let previousHash = genesisHash;
  const events = [];
  for (const e of validated.events) {
    const item = {
      sequence: e.sequence,
      event: e.event,
      data: e.data,
      provenance: e.provenance,
      previousHash
    };
    const hash = await digest(canonical(item));
    events.push({ ...item, hash });
    previousHash = hash;
  }
  const body = {
    ...header,
    source,
    modules: moduleSources,
    moduleHashes,
    genesisHash,
    events,
    headHash: previousHash
  };
  const receiptHash = await digest(canonical(body));
  const result = { ...body, receiptHash };
  ensure(JSON.stringify(result).length <= MAX_RECEIPT_CHARS, "Package receipt too large");
  return result;
}

async function verifyPackageReceipt(receipt) {
  try {
    exactKeys(receipt, [
      "schema", "algorithm", "createdAt", "sourceHash", "moduleSetHash", "execution",
      "source", "modules", "moduleHashes", "genesisHash", "events", "headHash", "receiptHash"
    ], "v2 receipt");
    ensure(receipt.schema === PACKAGE_RECEIPT_SCHEMA, "Unsupported package receipt schema");
    ensure(receipt.algorithm === ALGORITHM, "Unsupported digest algorithm");
    ensure(JSON.stringify(receipt).length <= MAX_RECEIPT_CHARS, "Receipt too large");
    ensure(Array.isArray(receipt.events) && receipt.events.length <= 1000, "Invalid event chain");
    const names = validateModuleRegistry(receipt.modules);
    ensure(names.length > 0, "v2 receipt must include module sources");
    exactKeys(receipt.moduleHashes, names, "module hashes");
    for (const name of names) {
      ensure(typeof receipt.moduleHashes[name] === "string" &&
        /^[0-9a-f]{64}$/.test(receipt.moduleHashes[name]), "Malformed module hash");
    }
    const events = receipt.events.map((entry, index) => {
      exactKeys(entry, ["sequence", "event", "data", "provenance", "previousHash", "hash"], "event " + (index + 1));
      ensure(typeof entry.previousHash === "string" && /^[a-f0-9]{64}$/.test(entry.previousHash), "Invalid previous event hash");
      ensure(typeof entry.hash === "string" && /^[a-f0-9]{64}$/.test(entry.hash), "Invalid event hash");
      return { sequence: entry.sequence, event: entry.event, data: entry.data, provenance: entry.provenance };
    });
    const computed = await createPackageReceipt(
      receipt.source, { ...receipt.execution, ledger: events },
      receipt.modules, { createdAt: receipt.createdAt }
    );
    const valid = canonical(computed) === canonical(receipt);
    return valid
      ? { valid: true, reason: "SHA-256 source, modules, transcript and event chain match",
          schema: PACKAGE_RECEIPT_SCHEMA, modules: names.length,
          moduleSetHash: receipt.moduleSetHash, headHash: receipt.headHash,
          receiptHash: receipt.receiptHash, events: events.length }
      : { valid: false, reason: "Source, module, event or transcript digest mismatch" };
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : "Invalid v2 receipt" };
  }
}

/** Recognizes v1 standalone and v2 package receipts. Never runs PhiThon code. */
export async function verifyReceipt(receipt) {
  if (receipt?.schema === PACKAGE_RECEIPT_SCHEMA) return verifyPackageReceipt(receipt);
  return verifyLegacyReceipt(receipt);
}

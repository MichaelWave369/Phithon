/**
 * PhiVibe R15: detached Ed25519 custody signature for original Vibe proof v1.
 *
 * A signature attests ONLY that whoever holds the corresponding private key
 * signed these exact .vibe and .vibe.proof.json BYTES. No independent compiler
 * run, hardware integrity, trusted signer identity, or semantic proof.
 *
 * Keys must be generated, safeguarded and trusted OUTSIDE this application.
 * The verification public key is explicitly supplied out of band.
 */
import {
  createHash, createPublicKey, createPrivateKey, sign, verify,
} from "node:crypto";
import { extractFullVibeObligations, MAX_VIBE_FULL_PROOF_BYTES } from "./vibe-full-proof.js";
import { validateVibeProofBrief } from "./vibe-proof.js";

export const VIBE_CUSTODY_SCHEMA = "phithon.vibe-custody-envelope.v1";
export const VIBE_CUSTODY_RESULT_SCHEMA = "phithon.vibe-custody-check.v1";
export const MAX_VIBE_CUSTODY_ENVELOPE_BYTES = 8192;
export const MAX_VIBE_CUSTODY_KEY_BYTES = 16384;
const HEX = /^[0-9a-f]{64}$/;
const B64_SIG = /^[A-Za-z0-9+/]{86}==$/;
const DOMAIN = "PHITHON_VIBE_CUSTODY_ED25519_V1\n";
const exact = (x, keys) => x !== null && typeof x === "object" &&
  !Array.isArray(x) && Object.keys(x).length === keys.length &&
  Object.keys(x).every(k => keys.includes(k));

function refuse(ok, message) {
  if (!ok) throw new TypeError("PhiVibe custody: " + message);
}
function bytesLimit(text, max, what) {
  refuse(typeof text === "string" &&
    Buffer.byteLength(text,"utf8") <= max, what+" exceeds limit");
}
function sha(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
function decodeProof(rawProof, proofBrief, vibeSource) {
  bytesLimit(rawProof, MAX_VIBE_FULL_PROOF_BYTES, "proof JSON");
  bytesLimit(vibeSource, 100000, "Vibe source");
  refuse(vibeSource.length > 0, "empty Vibe source");
  validateVibeProofBrief(proofBrief);
  let full;
  try { full = JSON.parse(rawProof); }
  catch { throw new TypeError("PhiVibe custody: invalid full proof JSON"); }
  const rows = extractFullVibeObligations(full, proofBrief);
  const sourceHash = sha(vibeSource);
  refuse(sourceHash === full.source_hash &&
    sourceHash === proofBrief.intent_summary.source_hash,
    "source bytes don't match original Vibe proof and brief hashes");
  return {full,rows,sourceHash,proofHash:sha(rawProof)};
}
function loadPrivate(privatePem) {
  bytesLimit(privatePem, MAX_VIBE_CUSTODY_KEY_BYTES, "private key");
  let key;
  try { key = createPrivateKey(privatePem); }
  catch { throw new TypeError("PhiVibe custody: invalid private key PEM"); }
  refuse(key.asymmetricKeyType === "ed25519",
    "only Ed25519 private keys allowed");
  return key;
}
function loadPublic(publicPem) {
  bytesLimit(publicPem, MAX_VIBE_CUSTODY_KEY_BYTES, "public key");
  let key;
  try { key = createPublicKey(publicPem); }
  catch { throw new TypeError("PhiVibe custody: invalid public key PEM"); }
  refuse(key.asymmetricKeyType === "ed25519",
    "only Ed25519 public keys allowed");
  return key;
}
function spkiFingerprint(key) {
  return createHash("sha256").update(
    key.export({type:"spki",format:"der"})
  ).digest("hex");
}
function message(sourceHash, proofHash) {
  return Buffer.from(DOMAIN + sourceHash + "\n" + proofHash + "\n","utf8");
}
export function validateVibeCustodyEnvelope(value) {
  refuse(exact(value, ["schema","algorithm","sourceSha256","proofSha256",
    "publicKeySpkiSha256","signatureBase64","provenance"]) &&
    value.schema === VIBE_CUSTODY_SCHEMA &&
    value.algorithm === "Ed25519" &&
    value.provenance === "OPERATOR_SIGNED_CUSTODY_UNATTESTED" &&
    typeof value.sourceSha256 === "string" && HEX.test(value.sourceSha256) &&
    typeof value.proofSha256 === "string" && HEX.test(value.proofSha256) &&
    typeof value.publicKeySpkiSha256 === "string" &&
      HEX.test(value.publicKeySpkiSha256) &&
    typeof value.signatureBase64 === "string" &&
      B64_SIG.test(value.signatureBase64) &&
    Buffer.from(value.signatureBase64,"base64").length === 64,
    "unsupported custody envelope fields or signature encoding");
  return value;
}
export function parseVibeCustodyEnvelopeJson(raw) {
  bytesLimit(raw, MAX_VIBE_CUSTODY_ENVELOPE_BYTES, "envelope JSON");
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new TypeError("PhiVibe custody: invalid envelope JSON"); }
  return validateVibeCustodyEnvelope(value);
}

/**
 * Explicit local signing action, never performed by import, browser or
 * automated model dispatch. Does not write key material or execute .vibe.
 */
export function signVibeProofCustody({
  rawProof, proofBrief, vibeSource, privateKeyPem
}) {
  const input = decodeProof(rawProof, proofBrief, vibeSource);
  const privateKey = loadPrivate(privateKeyPem);
  const publicKey = createPublicKey(privateKey);
  const signature = sign(null,
    message(input.sourceHash,input.proofHash),privateKey);
  refuse(signature.length === 64, "unexpected Ed25519 signature length");
  return validateVibeCustodyEnvelope({
    schema:VIBE_CUSTODY_SCHEMA,
    algorithm:"Ed25519",
    sourceSha256:input.sourceHash,
    proofSha256:input.proofHash,
    publicKeySpkiSha256:spkiFingerprint(publicKey),
    signatureBase64:signature.toString("base64"),
    provenance:"OPERATOR_SIGNED_CUSTODY_UNATTESTED"
  });
}

/**
 * Verify with a separate public key chosen by the operator, never fetched
 * from the envelope. Returns an explicit custody-only result. Throws on
 * malformed inputs or on invalid/wrong-key/tampered signatures (fail closed).
 */
export function verifyVibeProofCustody({
  envelope, rawProof, proofBrief, vibeSource, publicKeyPem
}) {
  validateVibeCustodyEnvelope(envelope);
  const input = decodeProof(rawProof,proofBrief,vibeSource);
  const publicKey = loadPublic(publicKeyPem);
  const fingerprint = spkiFingerprint(publicKey);
  refuse(fingerprint === envelope.publicKeySpkiSha256,
    "supplied public key does not match signed key fingerprint");
  refuse(envelope.sourceSha256 === input.sourceHash &&
    envelope.proofSha256 === input.proofHash,
    "source or full proof bytes differ from signed custody envelope");
  const sig = Buffer.from(envelope.signatureBase64,"base64");
  refuse(verify(null,
    message(input.sourceHash,input.proofHash),publicKey,sig),
    "Ed25519 signature verification FAILED");
  return {
    schema:VIBE_CUSTODY_RESULT_SCHEMA,
    signatureValid:true,
    sourceSha256:input.sourceHash,
    proofSha256:input.proofHash,
    publicKeySpkiSha256:fingerprint,
    originalProofObligations:input.rows.length,
    custodyStatus:"VALID_SIGNATURE_FOR_SUPPLIED_KEY_AND_BYTES",
    originalProofAndBriefCrossChecked:true,
    signerIdentityIndependentlyTrusted:false,
    compilerInvocationAttested:false,
    actualVibeVerificationProven:false,
    phithonSemanticEquivalenceVerified:false,
    modelRoutingApproved:false,
    provenance:"OPERATOR_PROVIDED_PUBLIC_KEY_UNATTESTED"
  };
}

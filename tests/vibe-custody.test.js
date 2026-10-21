import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  VIBE_CUSTODY_SCHEMA, VIBE_CUSTODY_RESULT_SCHEMA, signVibeProofCustody,
  verifyVibeProofCustody, validateVibeCustodyEnvelope,
  parseVibeCustodyEnvelopeJson
} from "../src/bridge/vibe-custody.js";

const sha=s=>createHash("sha256").update(s,"utf8").digest("hex");
const vibeSource='intent Custody:\n  goal: "Test source identity"\n  inputs:\n    x: number\n  outputs:\n    y: number\nemit python\n';
const proof=()=>({
  artifact_version:"v1",schema_version:"v1",
  source_path:"/private/Vibe/contract.vibe",source_hash:sha(vibeSource),
  ir_hash:"a".repeat(64),emit_target:"python",verification_backend:"heuristic",
  result:{passed:true,emission_blocked:false},
  obligations:Array.from({length:12},(_,i)=>({
    obligation_id:"preserve."+(i+1),category:"preserve",
    description:"private requirement with words "+i,
    source_location:"/private/user/path:"+i,
    status:i===10?"unknown":"satisfied",evidence:"never publish",
    critical:i===0
  })),
  runtime_monitor:{secret:"private outcome"}
});
const brief=()=>({
  brief_version:"phase-8.4.proof-brief.v1",
  proof_path:"/private/user/proof.json",
  proof_artifact_version:"v1",source_path:"/private/Vibe/contract.vibe",
  verification_backend:"heuristic",
  result:{passed:true,emission_blocked:false},
  intent_summary:{
    source_hash:sha(vibeSource),ir_hash:"a".repeat(64),
    emit_target:"python",package_context:{},domain_profile:null,self_hosting:{}
  },
  preserve_constraint_summary:{
    obligation_summary:{satisfied:11,unknown:1},
    obligations_sample:proof().obligations.slice(0,10).map(
      o=>({obligation_id:o.obligation_id,category:o.category,
        status:o.status,critical:o.critical})),
    obligations_total:12
  },
  bridge_result:{bridge_score:0.9,verdict:"preserved",
    measurement_ratio:0.8,epsilon_metrics:{}},
  equivalence_drift_summary:{
    intent_equivalence_score:0.9,drift_score:0.1,
    intent_items_total:2,intent_items_missing:0,intent_items_unknown:0
  },
  interchange_metadata:{
    source_kind:"proof_artifact",consumer_safe:true,deterministic_projection:true,
    notes:["Derived from existing proof artifact fields."]
  }
});
const keyPair=()=> {
  const {privateKey,publicKey}=generateKeyPairSync("ed25519");
  return {
    privateKeyPem:privateKey.export({type:"pkcs8",format:"pem"}),
    publicKeyPem:publicKey.export({type:"spki",format:"pem"})
  };
};
const signCase=(keys,source=vibeSource,rawProof=JSON.stringify(proof()))=>
  signVibeProofCustody({rawProof,proofBrief:brief(),vibeSource:source,
    privateKeyPem:keys.privateKeyPem});

test("R15 signs and verifies real Ed25519 full Vibe proof + source byte custody",()=>{
  const keys=keyPair(),rawProof=JSON.stringify(proof());
  const envelope=signCase(keys);
  assert.equal(envelope.schema,VIBE_CUSTODY_SCHEMA);
  assert.equal(envelope.algorithm,"Ed25519");
  assert.equal(envelope.sourceSha256,sha(vibeSource));
  assert.equal(envelope.proofSha256,sha(rawProof));
  const result=verifyVibeProofCustody({envelope,rawProof,proofBrief:brief(),
    vibeSource,publicKeyPem:keys.publicKeyPem});
  assert.equal(result.schema,VIBE_CUSTODY_RESULT_SCHEMA);
  assert.equal(result.signatureValid,true);
  assert.equal(result.originalProofObligations,12);
  assert.equal(result.originalProofAndBriefCrossChecked,true);
  for(const field of [
    "signerIdentityIndependentlyTrusted","compilerInvocationAttested",
    "actualVibeVerificationProven","phithonSemanticEquivalenceVerified",
    "modelRoutingApproved"
  ]) assert.equal(result[field],false);
  const exported=JSON.stringify(result)+JSON.stringify(envelope);
  assert.doesNotMatch(exported,/private\/user|never publish|private requirement|private outcome|BEGIN PRIVATE KEY/);
});

test("R15 Ed25519 signatures are deterministic for identical input and key",()=>{
  const keys=keyPair();
  const a=signCase(keys),b=signCase(keys);
  assert.deepEqual(a,b);
  assert.equal(a.signatureBase64.length,88);
});

test("R15 refuses same-length changed proof byte formatting and source text",()=>{
  const keys=keyPair(),rawProof=JSON.stringify(proof()),envelope=signCase(keys);
  assert.throws(()=>verifyVibeProofCustody({
    envelope,rawProof:rawProof+" ",proofBrief:brief(),vibeSource,
    publicKeyPem:keys.publicKeyPem
  }),/proof bytes differ/);
  assert.throws(()=>verifyVibeProofCustody({
    envelope,rawProof,proofBrief:brief(),vibeSource:vibeSource+"\n",
    publicKeyPem:keys.publicKeyPem
  }),/source bytes don't match/);
});

test("R15 signer key not trusted from envelope: wrong separately supplied key always rejected",()=>{
  const keys=keyPair(),other=keyPair(),envelope=signCase(keys);
  assert.throws(()=>verifyVibeProofCustody({
    envelope,rawProof:JSON.stringify(proof()),proofBrief:brief(),
    vibeSource,publicKeyPem:other.publicKeyPem
  }),/public key does not match/);
});

test("R15 refuses modified, malformed, and invented signed metadata",()=>{
  const keys=keyPair(),envelope=signCase(keys),rawProof=JSON.stringify(proof());
  for(const mutate of [
    x=>{x.provenance="VERIFIED_VIBE_EXECUTION";},
    x=>{x.algorithm="RSA";},
    x=>{x.modelApproved=true;},
    x=>{x.sourceSha256="f".repeat(64);},
    x=>{x.publicKeySpkiSha256="b".repeat(64);},
    x=>{x.signatureBase64="A".repeat(86)+"==";},
    x=>{x.signatureBase64="UNSAFE";},
    x=>{x.schema="v2";},
  ]){
    const changed=structuredClone(envelope);mutate(changed);
    if(Object.keys(changed).length===Object.keys(envelope).length
        && /^[A-Za-z0-9+/]{86}==$/.test(changed.signatureBase64)
        && changed.provenance===envelope.provenance
        && changed.algorithm===envelope.algorithm
        && changed.schema===envelope.schema
        && changed.sourceSha256===envelope.sourceSha256
        && changed.publicKeySpkiSha256===envelope.publicKeySpkiSha256) {
      assert.throws(()=>verifyVibeProofCustody({
        envelope:changed,rawProof,proofBrief:brief(),
        vibeSource,publicKeyPem:keys.publicKeyPem
      }),/signature verification FAILED/);
    } else {
      assert.throws(()=>verifyVibeProofCustody({
        envelope:changed,rawProof,proofBrief:brief(),
        vibeSource,publicKeyPem:keys.publicKeyPem
      }),/PhiVibe custody:/);
    }
  }
});

test("R15 signs only Vibe v1 original artifacts with matching Phase 8.4 brief",()=>{
  const keys=keyPair();
  for(const change of [
    x=>{x.schema_version="v2";},
    x=>{x.source_hash="c".repeat(64);},
    x=>{x.obligations.push({...x.obligations[0],obligation_id:"new"});},
    x=>{x.obligations[0].description={secret:true};},
  ]){
    const altered=proof();change(altered);
    assert.throws(()=>signVibeProofCustody({
      rawProof:JSON.stringify(altered),proofBrief:brief(),vibeSource,
      privateKeyPem:keys.privateKeyPem
    }),/PhiVibe full proof:/);
  }
  const other=brief();other.intent_summary.source_hash="b".repeat(64);
  assert.throws(()=>signVibeProofCustody({
    rawProof:JSON.stringify(proof()),proofBrief:other,vibeSource,
    privateKeyPem:keys.privateKeyPem
  }),/PhiVibe full proof:/);
});

test("R15 invalid key formats, unsupported curves, oversized envelopes refused",()=>{
  const ed=keyPair();
  assert.throws(()=>signVibeProofCustody({
    rawProof:JSON.stringify(proof()),proofBrief:brief(),
    vibeSource,privateKeyPem:"not a key"
  }),/invalid private key/);
  const alt=generateKeyPairSync("ed448");
  assert.throws(()=>signVibeProofCustody({
    rawProof:JSON.stringify(proof()),proofBrief:brief(),
    vibeSource,privateKeyPem:alt.privateKey.export({type:"pkcs8",format:"pem"})
  }),/only Ed25519/);
  const envelope=signCase(ed);
  assert.throws(()=>verifyVibeProofCustody({
    envelope,rawProof:JSON.stringify(proof()),proofBrief:brief(),
    vibeSource,publicKeyPem:"not a PEM"
  }),/invalid public key/);
  assert.throws(()=>parseVibeCustodyEnvelopeJson("{broken"),/invalid envelope JSON/);
  assert.throws(()=>parseVibeCustodyEnvelopeJson("x".repeat(8193)),/exceeds limit/);
  assert.throws(()=>validateVibeCustodyEnvelope({...envelope,spoof:true}),/unsupported/);
});

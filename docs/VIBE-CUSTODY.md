# PhiVibe R15: Ed25519 evidence custody

PhiThon R15 introduces **opt-in local signature custody**, not trusted execution attestation. It signs the exact UTF-8 bytes of a Vibe `contract.vibe` and the exact original `.vibe.proof.json` bytes using Ed25519. Verification requires a separately supplied public key, checks that the full proof still matches the Phase 8.4 short proof brief and its source hash, then verifies the Ed25519 signature over an unambiguous domain-separated message.

This is distinct from **Vibe verifier correctness**, PhiThon semantic equivalence, or the R14 obligation ledger. The signer could sign false data, and the verifying operator must establish the public key's owner and trustworthiness **outside PhiThon**.

## Operator setup

Use an existing, separately installed Vibe toolchain to create an original proof and its Phase 8.4 brief:

~~~sh
vibec verify-proof contract.vibe
vibec proof-brief contract.vibe.proof.json --report json --write-output proof-brief.json
~~~

Generate a fresh Ed25519 keypair using OpenSSL or other independently trusted tooling. The private key **must never be committed, pasted into chat, uploaded to a website or shared with others**.

~~~sh
openssl genpkey -algorithm ED25519 -out operator-private.pem
openssl pkey -in operator-private.pem -pubout -out operator-public.pem
~~~

Protect the private key with your OS access controls and key management practices. If you use the PEM in a local repository folder, add the private PEM to .gitignore and verify it is not staged. Signing requires a deliberate one-shot CLI flag:

~~~sh
npm run phi -- vibe-custody-sign contract.vibe.proof.json proof-brief.json contract.vibe operator-private.pem --out custody.json --confirm-sign
~~~

PhiThon never stores the key in the envelope and never sends it over the network. The command does not invoke Vibe or run PhiThon source. It validates the original full proof and compact brief first, then signs a digest pair covering the exact source and full-proof bytes. The output is exclusively created (no silent overwrites).

To verify, **obtain the public key independently from the person or system whose signatures you trust**, not from the untrusted envelope itself:

~~~sh
npm run phi -- vibe-custody-check custody.json contract.vibe.proof.json proof-brief.json contract.vibe operator-public.pem
~~~

The output includes a SHA-256 fingerprint of the supplied public key's **SPKI DER encoding**. Compare that fingerprint using a trusted channel if attribution matters. A signature is only attributable to a key, not automatically to a human or organization.

## Envelope schema

~~~json
{
  "schema": "phithon.vibe-custody-envelope.v1",
  "algorithm": "Ed25519",
  "sourceSha256": "<64 lowercase SHA-256 hex characters>",
  "proofSha256": "<64 lowercase SHA-256 hex characters>",
  "publicKeySpkiSha256": "<64 lowercase SHA-256 hex characters>",
  "signatureBase64": "<88 characters, canonical Ed25519 signature>",
  "provenance": "OPERATOR_SIGNED_CUSTODY_UNATTESTED"
}
~~~

**Signed payload**, UTF-8 encoded, contains exactly:

~~~text
PHITHON_VIBE_CUSTODY_ED25519_V1
<sourceSha256>
<proofSha256>
~~~

There is a trailing newline after the final hash. This domain separation prevents treating a signature for unrelated data as a PhiVibe custody signature. No timestamps, network resources, executable code, dynamic trusted signing keys, or unspecified metadata are accepted.

## What is validated

- Original Vibe full proof `artifact_version=v1`, `schema_version=v1`, full obligation array, source SHA-256, IR SHA-256, backend, reported result and first-ten projection must agree with the corresponding Phase 8.4 short proof brief (R14 validation).
- The actual supplied `contract.vibe` **byte hash** must equal the source SHA-256 claimed by the proof/brief.
- SHA-256 of the **exact original proof JSON text bytes**, including whitespace, must match the signed envelope. Reformatting changes its digest and will require re-signing.
- Public key must be a PEM Ed25519 public key and its SPKI fingerprint must match the envelope. A different key, forged signature, changed source/proof or malformed envelope causes nonzero CLI exit.
- Limits: source 100 KiB; original proof 2 MiB; key 16 KiB; envelope 8 KiB. Original proof must contain at most 512 unique obligations.

## Important limits

A valid signature establishes that **the holder of the corresponding private key signed this exact source/proof hash pair**. It does NOT independently establish:

- The private key holder's real-world identity or whether the key is trustworthy;
- Whether the Vibe compiler actually produced the original proof file or executed a verification run;
- Whether claims inside the proof artifact are correct or untampered *before the signing event*;
- Trusted timing, hardware/OS integrity, rollback prevention, or remote attestation;
- Vibe-to-PhiThon semantic equivalence, preservation correctness, or SPV model/route approval.

The result always reports `signerIdentityIndependentlyTrusted:false`, `compilerInvocationAttested:false`, `actualVibeVerificationProven:false`, `phithonSemanticEquivalenceVerified:false` and `modelRoutingApproved:false`.

For higher-assurance provenance, a future phase can independently check public keys against operator-managed trust registries and reproducible compiler-run attestations with pinned Vibe versions, environment hashes and *observed* outputs. R15 does not fabricate those guarantees.

**LEDGER ABOVE EGO: signature validation identifies the key and bytes, not the truth of every claim inside the file.**

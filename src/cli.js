#!/usr/bin/env node
import { readFile, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { runIsolated } from "./cli/isolate.js";
import { loadProjectModules } from "./cli/package-loader.js";
import { createReceipt, createPackageReceipt, verifyReceipt } from "./ledger/receipts.js";
import { makeBrainHandoff } from "./brain/handoff.js";
import { inspectSpvBenchJson, SPV_BENCH_MAX_BYTES } from "./bridge/spv-evidence.js";
import { inspectVibeBriefJson, validateVibeBrief, createVibePhiLink, verifyVibePhiLink, MAX_VIBE_BRIEF_BYTES } from "./bridge/vibe-intent.js";
import { validateVibeProofBrief, inspectVibeProofBriefJson, createVibeProofCorrespondence, verifyVibeProofCorrespondence, MAX_VIBE_PROOF_BRIEF_BYTES } from "./bridge/vibe-proof.js";
import { parseVibeVectorsJson, runVibeBehaviorVectors, MAX_VIBE_VECTORS_BYTES } from "./bridge/vibe-behavior.js";
import { parseVibePropertyPlanJson, runVibePropertyPlan, MAX_VIBE_PROPERTIES_BYTES } from "./bridge/vibe-properties.js";
import { parseVibeObligationBindingsJson, buildVibeObligationLedger, MAX_VIBE_OBLIGATION_BINDINGS_BYTES } from "./bridge/vibe-obligations.js";
import { validateLocalDispatch, makeDispatchJournal, dispatchAuthorizedLocal } from "./brain/dispatch-local.js";

const HELP = [
  "PhiThon R13 · The Language of the Field",
  "",
  "Usage:",
  "  npm run phi -- examples/hello.phi",
  "  npm run phi -- check examples/hello.phi",
  "  npm run phi -- examples/packages/main.phi  # finds adjacent phithon.pack.json",
  "  npm run phi -- --receipt examples/packages/main.phi",
  "  npm run phi -- --receipt examples/modules.phi",
  "  npm run phi -- --brain-out requests.json examples/brain.phi",
  "  npm run phi -- dispatch-local requests.json --model gemma3:12b --request 1 --out reply.json --confirm-local",
  "  npm run phi -- verify examples/modules.phi.receipt.json",
  "  npm run phi -- verify-project myprogram.phi.receipt.json myprogram.phi",
  "  npm run phi -- vibe-inspect my-intent-brief.json",
  "  npm run phi -- vibe-proof-inspect my-proof-brief.json",
  "  npm run phi -- vibe-behavior link.json intent-brief.json contract.vibe implementation.phi vectors.json --out behavior-report.json",
  "  npm run phi -- vibe-properties link.json intent-brief.json contract.vibe implementation.phi properties.json --out property-report.json",
  "  npm run phi -- vibe-obligations proof-brief.json correspondence.json link.json intent-brief.json contract.vibe implementation.phi behavior-report.json property-report.json bindings.json --out evidence-ledger.json",
  "  npm run phi -- vibe-proof-link link.json proof-brief.json intent-brief.json contract.vibe implementation.phi --out correspondence.json",
  "  npm run phi -- vibe-proof-link-check correspondence.json link.json proof-brief.json intent-brief.json contract.vibe implementation.phi",
  "  npm run phi -- vibe-link my-intent-brief.json contract.vibe implementation.phi --out link.json",
  "  npm run phi -- vibe-link-check link.json my-intent-brief.json contract.vibe implementation.phi",
  "  npm run phi -- spv-bench-inspect vessie-local-evidence-bench-portable.json",
  "  npm run phi -- spv-bench-inspect vessie-local-evidence-bench-portable.json --models",
  "  npm run phi                            # stateless one-line REPL",
  "",
  "PhiShield R3 runs CLI programs inside a killable child process.",
  "Each run has a 2.5s wall-clock deadline and bounded pipes.",
  "This is NOT a secure OS sandbox for adversarial code.",
  "check parses .phi source and adjacent local package without executing it.",
  "Only regular .phi files named in phithon.pack.json are loaded; never downloaded.",
  "verify checks v1 standalone and v2 module-complete JSON without running it.",
  "verify-project compares a receipt with source and local package on disk.",
  "--brain-out grants brain.requests ONLY for this run, saving NOT_SENT JSON.",
  "No model call, SPV connection or network dispatch occurs automatically.",
  "dispatch-local requires a separate explicit confirmation and only reaches 127.0.0.1:11434.",
  "SPV and manual routes cannot be auto-dispatched. Replies are untrusted data.",
  "spv-bench-inspect validates an operator-exported SPV bench OFFLINE; no model execution.",
  "vibe-link verifies .vibe source SHA-256 and binds .phi code without proving semantic equivalence.",
  "vibe-proof-link matches a separately imported Vibe proof brief to an existing link, WITHOUT granting authority.",
  "vibe-behavior runs up to 8 operator-authored cases in separate bounded PhiShield children.",
  "Passing selected examples is NOT exhaustive equivalence or Vibe preservation proof.",
  "vibe-properties generates bounded, deterministic numeric inputs for a human-declared property.",
  "Seeded finite sample matches are NOT universal proof or trusted execution attestation.",
  "vibe-obligations maps reviewed associations to Vibe\x27s proof SAMPLE only; no verification promotion.",
  "Vibe is an independent intent compiler; PhiPython is Vibe\x27s guided Python layer, NOT PhiThon.",
  "A valid SHA-256 receipt is NOT an identity signature or proof of execution."
].join("\n");

async function readLimited(path, maxBytes = 400_000) {
  const info = await stat(path);
  if (info.size > maxBytes) throw new Error("PhiShield: input file too large");
  return readFile(path, "utf8");
}

async function run(source, receiptPath = null, modules = {}, brainOutPath = null) {
  try {
    const execution = await runIsolated(source, { modules, brainGrant: brainOutPath !== null });
    for (const line of execution.output) console.log(line);
    if (execution.result !== "null" && execution.output.length === 0) console.log(execution.result);
    if (execution.ledger.length) console.log("Ledger entries (SIMULATED):", JSON.stringify(execution.ledger, null, 2));
    console.error("PhiThon:", execution.steps, "steps");

    if (brainOutPath) {
      const payload = makeBrainHandoff(execution.brainRequests ?? []);
      await writeFile(brainOutPath, JSON.stringify(payload, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
      console.log("PhiBrain handoff created (NOT SENT):", brainOutPath);
      console.log("Requests queued:", payload.requests.length);
    }

    if (receiptPath) {
      const receipt = Object.keys(modules).length
        ? await createPackageReceipt(source, execution, modules)
        : await createReceipt(source, execution);
      await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
      console.log("Saved integrity receipt:", receiptPath);
      console.log("Receipt schema:", receipt.schema);
      console.log("Receipt SHA-256:", receipt.receiptHash);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function check(path) {
  try {
    const source = await readLimited(path);
    const modules = await loadProjectModules(path);
    const result = await runIsolated(source, { mode: "check", modules });
    console.log("Syntax OK · " + result.statements + " statements · " + result.tokens + " tokens · " + result.modules + " modules");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function verifyFile(path) {
  try {
    const raw = await readLimited(path, 750_000);
    const receipt = JSON.parse(raw);
    // Deliberately hashes only. NEVER execute arbitrary source from a JSON receipt.
    const verification = await verifyReceipt(receipt);
    console.log(verification.valid ? "INTEGRITY VALID" : "INTEGRITY INVALID", verification.reason);
    if (verification.valid) console.log("Receipt SHA-256:", verification.receiptHash);
    if (!verification.valid) process.exitCode = 1;
  } catch (error) {
    console.error("Verification failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function verifyProject(receiptPath, entryPath) {
  try {
    const raw = await readLimited(receiptPath, 750_000);
    const receipt = JSON.parse(raw);
    const checked = await verifyReceipt(receipt);
    if (!checked.valid) throw new Error("Invalid receipt: " + checked.reason);
    const source = await readLimited(entryPath);
    const modules = await loadProjectModules(entryPath);
    if (receipt.source !== source) throw new Error("Entry program source differs from receipt");
    const actualNames = Object.keys(modules).sort();
    const recorded = receipt.modules ?? {};
    const recordedNames = Object.keys(recorded).sort();
    if (actualNames.length !== recordedNames.length ||
        actualNames.some((name, i) => name !== recordedNames[i] || modules[name] !== recorded[name])) {
      throw new Error("Local PhiPack module source differs from receipt");
    }
    console.log("PROJECT MATCH: program and " + actualNames.length + " local modules match receipt bytes");
    console.log("Receipt SHA-256:", receipt.receiptHash);
  } catch (error) {
    console.error("PROJECT MISMATCH:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function dispatchLocalCommand(handoffPath, model, id, outputPath) {
  try {
    const raw = await readLimited(handoffPath, 32_768);
    const handoff = JSON.parse(raw);
    const item = validateLocalDispatch(handoff, {
      consent: true, model, requestId: Number(id)
    });
    // Exclusive, durable intent journal before any network side effect.
    // Reusing an output filename refuses a second dispatch.
    const journal = makeDispatchJournal(item);
    await writeFile(outputPath, JSON.stringify(journal, null, 2) + "\n", {
      encoding: "utf8", flag: "wx", mode: 0o600
    });
    console.error("PhiBrain: local dispatch approved for request", item.id, "model", model);
    console.error("PhiBrain: fixed destination 127.0.0.1:11434 only");
    try {
      const completed = await dispatchAuthorizedLocal(item);
      await writeFile(outputPath, JSON.stringify(completed, null, 2) + "\n", {
        encoding: "utf8", flag: "w", mode: 0o600
      });
      console.log("PhiBrain: local model response recorded in", outputPath);
      console.log("Model output is UNVERIFIED and must not be executed as commands.");
    } catch (error) {
      const uncertain = {
        ...journal,
        status: "ATTEMPTED_OUTCOME_UNCONFIRMED",
        error: error instanceof Error ? error.message : String(error)
      };
      try {
        await writeFile(outputPath, JSON.stringify(uncertain, null, 2) + "\n", {
          encoding: "utf8", flag: "w", mode: 0o600
        });
      } catch (writeError) {
        console.error("PhiBrain: could not update dispatch journal:", writeError.message);
      }
      throw error;
    }
  } catch (error) {
    console.error("PhiBrain dispatch NOT confirmed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function inspectSpvBenchFile(path, showModelNames = false) {
  try {
    const raw = await readLimited(path, SPV_BENCH_MAX_BYTES);
    const info = inspectSpvBenchJson(raw, { showModelNames });
    console.log("SPV BENCH: READ_ONLY_UNATTESTED_IMPORT");
    console.log("Evidence entries:", info.evidenceCount);
    console.log("Performance entries:", info.performanceCount);
    console.log("Human review entries:", info.humanReviewCount);
    console.log("Distinct reported model labels:", info.modelLabelCount);
    console.log("Performance rows with matching self-review:", info.performanceRowsWithMatchingReview);
    console.log("No model call, no routing authority, no quality approval.");
    console.log("Inspect:", JSON.stringify(info.rows, null, 2));
  } catch (error) {
    console.error("SPV BENCH REFUSED:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function readVibeBrief(path) {
  const raw = await readLimited(path, MAX_VIBE_BRIEF_BYTES);
  const brief = JSON.parse(raw);
  validateVibeBrief(brief);
  return brief;
}

async function inspectVibeBriefFile(path) {
  try {
    const raw = await readLimited(path, MAX_VIBE_BRIEF_BYTES);
    const summary = inspectVibeBriefJson(raw);
    console.log("VIBE: DECLARED_INTENT_UNVERIFIED");
    console.log(JSON.stringify(summary, null, 2));
    console.log("No .vibe verification or .phi execution occurred.");
  } catch (error) {
    console.error("VIBE REFUSED:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function createVibeLinkCommand(briefPath, vibePath, phiPath, outPath) {
  try {
    const brief = await readVibeBrief(briefPath);
    const vibeSource = await readLimited(vibePath, 100_000);
    const phiSource = await readLimited(phiPath, 100_000);
    const modules = await loadProjectModules(phiPath);
    const link = await createVibePhiLink(brief, vibeSource, phiSource, modules);
    await writeFile(outPath, JSON.stringify(link, null, 2) + "\n", {
      encoding: "utf8", flag: "wx", mode: 0o600
    });
    console.log("VIBE + PHITHON LINK CREATED · DECLARED_NOT_VERIFIED");
    console.log("Matched Vibe source hash:", link.vibe.sourceSha256);
    console.log("PhiThon source hash:", link.phithon.sourceSha256);
    console.log("No source ran; no semantic-equivalence proof was produced.");
  } catch (error) {
    console.error("VIBE LINK REFUSED:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function checkVibeLinkCommand(linkPath, briefPath, vibePath, phiPath) {
  try {
    const link = JSON.parse(await readLimited(linkPath, 40_000));
    const brief = await readVibeBrief(briefPath);
    const vibeSource = await readLimited(vibePath, 100_000);
    const phiSource = await readLimited(phiPath, 100_000);
    const modules = await loadProjectModules(phiPath);
    const status = await verifyVibePhiLink(link, brief, vibeSource, phiSource, modules);
    console.log(status.valid ? "VIBE + PHITHON SOURCE LINK MATCH" : "VIBE + PHITHON SOURCE LINK MISMATCH");
    console.log(status.reason);
    if (!status.valid) process.exitCode = 1;
  } catch (error) {
    console.error("VIBE LINK CHECK REFUSED:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function readVibeProofBrief(path) {
  const data = JSON.parse(await readLimited(path, MAX_VIBE_PROOF_BRIEF_BYTES));
  validateVibeProofBrief(data);
  return data;
}

async function inspectVibeProofFile(path) {
  try {
    const summary = inspectVibeProofBriefJson(await readLimited(path, MAX_VIBE_PROOF_BRIEF_BYTES));
    console.log("VIBE PROOF: SELF-REPORTED / UNATTESTED");
    console.log(JSON.stringify(summary, null, 2));
    console.log("No proof artifact authenticated; no source executed or intent equivalence inferred.");
  } catch (error) {
    console.error("VIBE PROOF REFUSED:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function vibeProofMaterials(linkPath, proofPath, briefPath, vibePath, phiPath) {
  const link = JSON.parse(await readLimited(linkPath, 40_000));
  const proofBrief = await readVibeProofBrief(proofPath);
  const intentBrief = await readVibeBrief(briefPath);
  const vibeSource = await readLimited(vibePath, 100_000);
  const phiSource = await readLimited(phiPath, 100_000);
  const modules = await loadProjectModules(phiPath);
  return { link, proofBrief, intentBrief, vibeSource, phiSource, modules };
}

async function vibeProofLinkCommand(linkPath, proofPath, briefPath, vibePath, phiPath, outPath) {
  try {
    const m = await vibeProofMaterials(linkPath, proofPath, briefPath, vibePath, phiPath);
    const record = await createVibeProofCorrespondence(
      m.link, m.proofBrief, m.intentBrief, m.vibeSource, m.phiSource, m.modules
    );
    await writeFile(outPath, JSON.stringify(record, null, 2) + "\n", {
      encoding: "utf8", flag: "wx", mode: 0o600
    });
    console.log("VIBE PROOF CORRESPONDENCE: SOURCE HASHES MATCH / REPORT UNATTESTED");
    console.log("Compiler reported pass:", record.report.compilerPassReported);
    console.log("Backend reported:", record.report.backendReported);
    console.log("PhiThon equivalence verified: false; no model authority granted.");
  } catch (error) {
    console.error("VIBE PROOF LINK REFUSED:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function checkVibeProofLinkCommand(correspondencePath, linkPath, proofPath, briefPath, vibePath, phiPath) {
  try {
    const record = JSON.parse(await readLimited(correspondencePath, 40_000));
    const m = await vibeProofMaterials(linkPath, proofPath, briefPath, vibePath, phiPath);
    const result = await verifyVibeProofCorrespondence(
      record, m.link, m.proofBrief, m.intentBrief, m.vibeSource, m.phiSource, m.modules
    );
    console.log(result.valid ? "VIBE PROOF CORRESPONDENCE MATCH" : "VIBE PROOF CORRESPONDENCE MISMATCH");
    console.log(result.reason);
    if (!result.valid) process.exitCode = 1;
  } catch (error) {
    console.error("VIBE PROOF LINK CHECK REFUSED:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function vibeBehaviorCommand(linkPath, briefPath, vibePath, phiPath, vectorsPath, outPath) {
  try {
    const link = JSON.parse(await readLimited(linkPath, 40_000));
    const intentBrief = await readVibeBrief(briefPath);
    const vibeSource = await readLimited(vibePath, 100_000);
    const phiSource = await readLimited(phiPath, 100_000);
    const modules = await loadProjectModules(phiPath);
    const vectors = parseVibeVectorsJson(
      await readLimited(vectorsPath, MAX_VIBE_VECTORS_BYTES), intentBrief
    );
    const report = await runVibeBehaviorVectors({
      link, intentBrief, vibeSource, phiSource, modules, vectors
    });
    // Exclusive creation prevents replacing previously reviewed evidence.
    await writeFile(outPath, JSON.stringify(report, null, 2) + "\n", {
      encoding: "utf8", flag: "wx", mode: 0o600
    });
    console.log("PHIVIBE BEHAVIOR:", report.outcome);
    console.log("Selected cases:", report.caseCount);
    console.log("Matches:", report.matches, "Mismatches:", report.mismatches, "Errors:", report.errors);
    console.log("Report:", outPath);
    console.log("No Vibe semantic equivalence, exhaustive verification or model authority is implied.");
    if (report.outcome !== "ALL_SELECTED_CASES_MATCH") process.exitCode = 1;
  } catch (error) {
    console.error("PHIVIBE BEHAVIOR REFUSED:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function vibePropertiesCommand(linkPath, briefPath, vibePath, phiPath, planPath, outPath) {
  try {
    const link = JSON.parse(await readLimited(linkPath, 40_000));
    const intentBrief = await readVibeBrief(briefPath);
    const vibeSource = await readLimited(vibePath, 100_000);
    const phiSource = await readLimited(phiPath, 100_000);
    const modules = await loadProjectModules(phiPath);
    const plan = parseVibePropertyPlanJson(
      await readLimited(planPath, MAX_VIBE_PROPERTIES_BYTES), intentBrief
    );
    const result = await runVibePropertyPlan({
      link, intentBrief, vibeSource, phiSource, modules, plan
    });
    await writeFile(outPath, JSON.stringify(result, null, 2) + "\n", {
      encoding: "utf8", flag: "wx", mode: 0o600
    });
    console.log("PHIVIBE PROPERTIES:", result.outcome);
    console.log("Property:", result.propertyKind, "seed:", result.seed);
    console.log("Samples:", result.sampleCount, "Matches:", result.matches,
      "Mismatches:", result.mismatches, "Errors:", result.errors,
      "Inconclusive:", result.inconclusive);
    console.log("Report:", outPath);
    console.log("Finite sample results are NOT general semantic equivalence or Vibe proof.");
    if (result.outcome !== "ALL_SAMPLED_CHECKS_MATCH") process.exitCode = 1;
  } catch (error) {
    console.error("PHIVIBE PROPERTIES REFUSED:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function vibeObligationsCommand(proofPath, correspondencePath, linkPath, briefPath,
  vibePath, phiPath, behaviorPath, propertyPath, bindingsPath, outPath) {
  try {
    const proofBrief = await readVibeProofBrief(proofPath);
    const correspondence = JSON.parse(await readLimited(correspondencePath, 40_000));
    const link = JSON.parse(await readLimited(linkPath, 40_000));
    const intentBrief = await readVibeBrief(briefPath);
    const vibeSource = await readLimited(vibePath, 100_000);
    const phiSource = await readLimited(phiPath, 100_000);
    const modules = await loadProjectModules(phiPath);
    const behaviorReport = JSON.parse(await readLimited(behaviorPath, 100_000));
    const propertyReport = JSON.parse(await readLimited(propertyPath, 100_000));
    const bindings = parseVibeObligationBindingsJson(
      await readLimited(bindingsPath, MAX_VIBE_OBLIGATION_BINDINGS_BYTES),
      proofBrief
    );
    const record = await buildVibeObligationLedger({
      link, intentBrief, proofBrief, correspondence, vibeSource, phiSource,
      modules, behaviorReport, propertyReport, bindings
    });
    await writeFile(outPath, JSON.stringify(record, null, 2) + "\n", {
      encoding: "utf8", flag: "wx", mode: 0o600
    });
    console.log("PHIVIBE OBLIGATIONS: OPERATOR_ASSOCIATIONS_UNATTESTED");
    console.log("Vibe obligations reported:", record.obligationsTotalReported,
      "In proof sample:", record.obligationsInProofSample,
      "Not exported:", record.obligationsOmittedFromProofSample);
    console.log("Sampled obligations with associations:", record.associatedSampledObligations,
      "Without all sampled matches:", record.unresolvedSampledObligations);
    console.log("Record:", outPath);
    console.log("No semantic coverage proof, execution attestation or authority granted.");
    if (record.unresolvedSampledObligations > 0 || record.obligationsOmittedFromProofSample > 0) {
      console.log("STATUS: INCOMPLETE EVIDENCE; inspect record before claiming coverage.");
    }
  } catch (error) {
    console.error("PHIVIBE OBLIGATIONS REFUSED:",
      error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const args = process.argv.slice(2);
if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
  console.log(HELP);
} else if (args[0] === "vibe-obligations" && args.length === 12 && args[10] === "--out") {
  await vibeObligationsCommand(args[1], args[2], args[3], args[4], args[5], args[6],
    args[7], args[8], args[9], args[11]);
} else if (args[0] === "vibe-properties" && args.length === 8 && args[6] === "--out") {
  await vibePropertiesCommand(args[1], args[2], args[3], args[4], args[5], args[7]);
} else if (args[0] === "vibe-behavior" && args.length === 8 && args[6] === "--out") {
  await vibeBehaviorCommand(args[1], args[2], args[3], args[4], args[5], args[7]);
} else if (args[0] === "vibe-proof-inspect" && args.length === 2) {
  await inspectVibeProofFile(args[1]);
} else if (args[0] === "vibe-proof-link" && args.length === 8 && args[6] === "--out") {
  await vibeProofLinkCommand(args[1], args[2], args[3], args[4], args[5], args[7]);
} else if (args[0] === "vibe-proof-link-check" && args.length === 7) {
  await checkVibeProofLinkCommand(args[1], args[2], args[3], args[4], args[5], args[6]);
} else if (args[0] === "vibe-inspect" && args.length === 2) {
  await inspectVibeBriefFile(args[1]);
} else if (args[0] === "vibe-link" && args.length === 6 && args[4] === "--out") {
  await createVibeLinkCommand(args[1], args[2], args[3], args[5]);
} else if (args[0] === "vibe-link-check" && args.length === 5) {
  await checkVibeLinkCommand(args[1], args[2], args[3], args[4]);
} else if (args[0] === "spv-bench-inspect" && (args.length === 2 ||
           (args.length === 3 && args[2] === "--models"))) {
  await inspectSpvBenchFile(args[1], args.length === 3);
} else if (args[0] === "verify" && args.length === 2) {
  await verifyFile(args[1]);
} else if (args[0] === "verify-project" && args.length === 3) {
  await verifyProject(args[1], args[2]);
} else if (args[0] === "check" && args.length === 2) {
  await check(args[1]);
} else if (args[0] === "dispatch-local" && args.length === 9 &&
           args[2] === "--model" && args[4] === "--request" &&
           args[6] === "--out" && args[8] === "--confirm-local") {
  await dispatchLocalCommand(args[1], args[3], args[5], args[7]);
} else if (args[0] === "--brain-out" && args.length === 3) {
  try { await run(await readLimited(args[2]), null, await loadProjectModules(args[2]), args[1]); }
  catch (error) { console.error("Cannot prepare PhiBrain handoff:", error.message); process.exitCode = 1; }
} else if (args[0] === "--receipt" && args.length === 2) {
  try { await run(await readLimited(args[1]), args[1] + ".receipt.json", await loadProjectModules(args[1])); }
  catch (error) { console.error("Cannot open:", error.message); process.exitCode = 1; }
} else if (args.length === 1) {
  try { await run(await readLimited(args[0]), null, await loadProjectModules(args[0])); }
  catch (error) { console.error("Cannot open:", error.message); process.exitCode = 1; }
} else if (args.length === 0) {
  console.log("PhiThon R13, stateless one-line mode (no package directory). Ctrl+C exits.");
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "phi>>> " });
  rl.prompt();
  let sequence = Promise.resolve();
  rl.on("line", line => {
    sequence = sequence.then(async () => {
      if (line.trim()) await run(line);
      rl.prompt();
    });
  });
} else {
  console.error(HELP);
  process.exitCode = 1;
}

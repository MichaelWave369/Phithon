#!/usr/bin/env node
import { readFile, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { runIsolated } from "./cli/isolate.js";
import { loadProjectModules } from "./cli/package-loader.js";
import { createReceipt, createPackageReceipt, verifyReceipt } from "./ledger/receipts.js";

const HELP = [
  "PhiThon R5 · The Language of the Field",
  "",
  "Usage:",
  "  npm run phi -- examples/hello.phi",
  "  npm run phi -- check examples/hello.phi",
  "  npm run phi -- examples/packages/main.phi  # finds adjacent phithon.pack.json",
  "  npm run phi -- --receipt examples/packages/main.phi",
  "  npm run phi -- --receipt examples/modules.phi",
  "  npm run phi -- verify examples/modules.phi.receipt.json",
  "  npm run phi -- verify-project myprogram.phi.receipt.json myprogram.phi",
  "  npm run phi                            # stateless one-line REPL",
  "",
  "PhiShield R3 runs CLI programs inside a killable child process.",
  "Each run has a 2.5s wall-clock deadline and bounded pipes.",
  "This is NOT a secure OS sandbox for adversarial code.",
  "check parses .phi source and adjacent local package without executing it.",
  "Only regular .phi files named in phithon.pack.json are loaded; never downloaded.",
  "verify checks v1 standalone and v2 module-complete JSON without running it.",
  "verify-project compares a receipt with source and local package on disk.",
  "A valid SHA-256 receipt is NOT an identity signature or proof of execution."
].join("\n");

async function readLimited(path, maxBytes = 400_000) {
  const info = await stat(path);
  if (info.size > maxBytes) throw new Error("PhiShield: input file too large");
  return readFile(path, "utf8");
}

async function run(source, receiptPath = null, modules = {}) {
  try {
    const execution = await runIsolated(source, { modules });
    for (const line of execution.output) console.log(line);
    if (execution.result !== "null" && execution.output.length === 0) console.log(execution.result);
    if (execution.ledger.length) console.log("Ledger entries (SIMULATED):", JSON.stringify(execution.ledger, null, 2));
    console.error("PhiThon:", execution.steps, "steps");

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

const args = process.argv.slice(2);
if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
  console.log(HELP);
} else if (args[0] === "verify" && args.length === 2) {
  await verifyFile(args[1]);
} else if (args[0] === "verify-project" && args.length === 3) {
  await verifyProject(args[1], args[2]);
} else if (args[0] === "check" && args.length === 2) {
  await check(args[1]);
} else if (args[0] === "--receipt" && args.length === 2) {
  try { await run(await readLimited(args[1]), args[1] + ".receipt.json", await loadProjectModules(args[1])); }
  catch (error) { console.error("Cannot open:", error.message); process.exitCode = 1; }
} else if (args.length === 1) {
  try { await run(await readLimited(args[0]), null, await loadProjectModules(args[0])); }
  catch (error) { console.error("Cannot open:", error.message); process.exitCode = 1; }
} else if (args.length === 0) {
  console.log("PhiThon R5, stateless one-line mode (no package directory). Ctrl+C exits.");
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

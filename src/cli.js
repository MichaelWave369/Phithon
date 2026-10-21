#!/usr/bin/env node
import { readFile, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { runIsolated } from "./cli/isolate.js";
import { createReceipt, verifyReceipt } from "./ledger/receipts.js";

const HELP = [
  "PhiThon R3 · The Language of the Field",
  "",
  "Usage:",
  "  npm run phi -- examples/hello.phi",
  "  npm run phi -- check examples/hello.phi",
  "  npm run phi -- --receipt examples/modules.phi",
  "  npm run phi -- verify examples/modules.phi.receipt.json",
  "  npm run phi                            # stateless one-line REPL",
  "",
  "PhiShield R3 runs CLI programs inside a killable child process.",
  "Each run has a 2.5s wall-clock deadline and bounded pipes.",
  "This is NOT a secure OS sandbox for adversarial code.",
  "check parses .phi source without executing it.",
  "verify hashes JSON receipts without executing the included source.",
  "A valid SHA-256 receipt is NOT a signed identity or proof of execution."
].join("\n");

async function readLimited(path, maxBytes = 400_000) {
  const info = await stat(path);
  if (info.size > maxBytes) throw new Error("PhiShield: input file too large");
  return readFile(path, "utf8");
}

async function run(source, receiptPath = null) {
  try {
    const execution = await runIsolated(source);
    for (const line of execution.output) console.log(line);
    if (execution.result !== "null" && execution.output.length === 0) console.log(execution.result);
    if (execution.ledger.length) console.log("Ledger entries (SIMULATED):", JSON.stringify(execution.ledger, null, 2));
    console.error("PhiThon:", execution.steps, "steps");

    if (receiptPath) {
      const receipt = await createReceipt(source, execution);
      await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
      console.log("Saved integrity receipt:", receiptPath);
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
    const result = await runIsolated(source, { mode: "check" });
    console.log("Syntax OK · " + result.statements + " statements · " + result.tokens + " tokens");
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

const args = process.argv.slice(2);
if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
  console.log(HELP);
} else if (args[0] === "verify" && args.length === 2) {
  await verifyFile(args[1]);
} else if (args[0] === "check" && args.length === 2) {
  await check(args[1]);
} else if (args[0] === "--receipt" && args.length === 2) {
  try { await run(await readLimited(args[1]), args[1] + ".receipt.json"); }
  catch (error) { console.error("Cannot open:", error.message); process.exitCode = 1; }
} else if (args.length === 1) {
  try { await run(await readLimited(args[0])); }
  catch (error) { console.error("Cannot open:", error.message); process.exitCode = 1; }
} else if (args.length === 0) {
  console.log("PhiThon R3, stateless one-line mode. Ctrl+C exits.");
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

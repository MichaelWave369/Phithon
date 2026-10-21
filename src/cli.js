#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { execute } from "./language/core.js";
import { createReceipt, verifyReceipt } from "./ledger/receipts.js";

const HELP = [
  "PhiThon R2 · The Language of the Field",
  "",
  "Usage:",
  "  npm run phi -- examples/hello.phi",
  "  npm run phi -- --receipt examples/modules.phi",
  "  npm run phi -- verify examples/modules.phi.receipt.json",
  "  npm run phi                            # stateless one-line REPL",
  "",
  "--receipt writes a SHA-256 chain integrity receipt beside your program.",
  "A valid receipt is NOT an identity signature or proof that execution occurred.",
  "Never run untrusted .phi programs; this CLI has no process timeout."
].join("\n");

async function run(source, receiptPath = null) {
  try {
    const execution = execute(source);
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
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

async function verifyFile(path) {
  try {
    const raw = await readFile(path, { encoding: "utf8" });
    if (raw.length > 750_000) throw new TypeError("Receipt file exceeds size limit");
    const receipt = JSON.parse(raw);
    const verification = await verifyReceipt(receipt);
    console.log(verification.valid ? "INTEGRITY VALID" : "INTEGRITY INVALID", verification.reason);
    if (verification.valid) console.log("Receipt SHA-256:", verification.receiptHash);
    if (!verification.valid) process.exitCode = 1;
  } catch (err) {
    console.error("Verification failed:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

const args = process.argv.slice(2);
if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
  console.log(HELP);
} else if (args[0] === "verify" && args.length === 2) {
  await verifyFile(args[1]);
} else if (args[0] === "--receipt" && args.length === 2) {
  try { await run(await readFile(args[1], "utf8"), args[1] + ".receipt.json"); }
  catch (err) { console.error("Cannot open:", err.message); process.exitCode = 1; }
} else if (args.length === 1) {
  try { await run(await readFile(args[0], "utf8")); }
  catch (err) { console.error("Cannot open:", err.message); process.exitCode = 1; }
} else if (args.length === 0) {
  console.log("PhiThon R2, stateless one-line mode. Ctrl+C exits.");
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "phi>>> " });
  rl.prompt();
  rl.on("line", async line => {
    if (line.trim()) await run(line);
    rl.prompt();
  });
} else {
  console.error(HELP);
  process.exitCode = 1;
}

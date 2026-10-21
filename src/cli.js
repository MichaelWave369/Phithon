#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { execute } from "./language/core.js";

function run(source) {
  try {
    const { output, result, ledger, steps } = execute(source);
    for (const line of output) console.log(line);
    if (result !== "null" && output.length === 0) console.log(result);
    if (ledger.length) console.log("Ledger (SIMULATED):", JSON.stringify(ledger, null, 2));
    console.error("PhiThon:", steps, "steps");
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
const input = process.argv[2];
if (input === "--help" || input === "-h") {
  console.log("PhiThon R0\n  npm run phi -- examples/hello.phi\n  npm run phi   (one-line, stateless REPL)");
} else if (input) {
  try { run(await readFile(input, "utf8")); }
  catch (err) { console.error("Cannot open:", err.message); process.exitCode = 1; }
} else {
  console.log("PhiThon R0, one-line mode. Each line runs in a fresh scope; Ctrl+C exits.");
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "phi>>> " });
  rl.prompt();
  rl.on("line", line => {
    if (line.trim()) run(line);
    rl.prompt();
  });
}

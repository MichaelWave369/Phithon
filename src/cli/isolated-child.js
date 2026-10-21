/**
 * Internal PhiShield R3 child entrypoint.
 *
 * This child runs PhiThon code or checks PhiThon syntax via stdin JSON.
 * No code is eval'ed in JS. It is still an ordinary Node process under the
 * SAME operating-system account, NOT a hardened security sandbox.
 */
import { execute, parse, tokenize } from "../language/core.js";
import { analyzePackage, validateModuleRegistry } from "../language/package.js";

const MAX_INPUT_BYTES = 900_000;
const inputChunks = [];
let inputBytes = 0;

function send(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
}
function fail(error) {
  send({
    ok: false,
    error: {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error)
    }
  });
}
try {
  for await (const chunk of process.stdin) {
    inputBytes += chunk.length;
    if (inputBytes > MAX_INPUT_BYTES) throw new Error("PhiShield: child input limit exceeded");
    inputChunks.push(chunk);
  }
  const request = JSON.parse(Buffer.concat(inputChunks).toString("utf8"));
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("PhiShield: request must be an object");
  }
  const { source, mode, options } = request;
  const modules = request.modules ?? {};
  const brainGrant = request.brainGrant === true;
  validateModuleRegistry(modules);
  if (typeof source !== "string" || source.length > 100_000) {
    throw new TypeError("PhiShield: invalid source");
  }
  if (mode === "check") {
    // Parsing and token counting ONLY. Does not execute PhiThon programs.
    const info = analyzePackage(source, modules);
    const tokens = tokenize(source);
    send({ ok: true, value: { valid: true, statements: info.statements, tokens: tokens.length - 1, modules: info.modules, imports: info.imports, order: info.order } });
  } else if (mode === "execute") {
    // Fixed child policy; caller cannot inject arbitrary host capabilities.
    const maxSteps = Number.isInteger(options?.maxSteps) && options.maxSteps > 0
      ? Math.min(options.maxSteps, 30_000) : 30_000;
    const maxOutputChars = Number.isInteger(options?.maxOutputChars) && options.maxOutputChars > 0
      ? Math.min(options.maxOutputChars, 12_000) : 12_000;
    analyzePackage(source, modules);
    send({ ok: true, value: execute(source, { maxSteps, maxOutputChars, modules, brainGrant }) });
  } else {
    throw new TypeError("PhiShield: unsupported child mode");
  }
} catch (error) {
  fail(error);
  process.exitCode = 1;
}

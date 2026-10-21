/**
 * PhiShield R3: killable Node child runner for the CLI.
 *
 * Enforces a wall-clock deadline, buffer ceilings, a small V8 heap budget
 * and a sparse environment. No shell invocation. The child still has ordinary
 * OS account privileges; this is NOT a security sandbox for hostile input.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateModuleRegistry } from "../language/package.js";

const CHILD = fileURLToPath(new URL("./isolated-child.js", import.meta.url));
const MAX_STDOUT_BYTES = 1_000_000;
const MAX_STDERR_BYTES = 32_768;

export async function runIsolated(source, { mode = "execute", timeoutMs = 2500, signal, modules = {}, brainGrant = false } = {}) {
  if (typeof source !== "string" || source.length > 100_000 || Buffer.byteLength(source, "utf8") > 400_000) {
    throw new TypeError("PhiShield: source is too large or invalid");
  }
  if (mode !== "execute" && mode !== "check") throw new TypeError("PhiShield: unsupported mode");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new TypeError("PhiShield: timeoutMs must be an integer 1..10000");
  }
  if (signal?.aborted) throw new Error("PhiShield: execution cancelled");
  validateModuleRegistry(modules);
  if (typeof brainGrant !== "boolean") throw new TypeError("PhiBrain: brainGrant must be boolean");
  const request = JSON.stringify({ mode, source, modules, brainGrant, options: { maxSteps: 30_000, maxOutputChars: 12_000 } });
  if (Buffer.byteLength(request, "utf8") > 850_000) throw new TypeError("PhiPack: IPC payload too large");

  // Absolute Node binary + fixed child path; no shell, no arbitrary command.
  // Retain SystemRoot only when Windows needs it to launch Node.
  const env = process.platform === "win32" && process.env.SystemRoot
    ? { SystemRoot: process.env.SystemRoot } : {};
  const child = spawn(process.execPath, ["--max-old-space-size=96", CHILD], {
    cwd: process.cwd(),
    env,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    shell: false
  });

  return await new Promise((resolve, reject) => {
    let completed = false, timedOut = false, cancelled = false;
    let stdoutSize = 0, stderrSize = 0;
    const stdout = [], stderr = [];
    let timer;
    function abort() {
      cancelled = true;
      child.kill("SIGKILL");
    }
    function finalize(error, value) {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(value);
    }
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", chunk => {
      stdoutSize += chunk.length;
      if (stdoutSize > MAX_STDOUT_BYTES) {
        child.kill("SIGKILL");
        finalize(new Error("PhiShield: child output limit exceeded"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", chunk => {
      stderrSize += chunk.length;
      if (stderrSize > MAX_STDERR_BYTES) {
        child.kill("SIGKILL");
        finalize(new Error("PhiShield: child error output limit exceeded"));
        return;
      }
      stderr.push(chunk);
    });
    child.on("error", error => finalize(error));
    child.on("close", (code, sig) => {
      if (completed) return;
      if (timedOut) {
        finalize(new Error("PhiShield: execution exceeded " + timeoutMs + " ms deadline"));
        return;
      }
      if (cancelled) {
        finalize(new Error("PhiShield: execution cancelled"));
        return;
      }
      let payload;
      try { payload = JSON.parse(Buffer.concat(stdout).toString("utf8")); }
      catch {
        const detail = Buffer.concat(stderr).toString("utf8").slice(0, 240);
        finalize(new Error("PhiShield: child terminated without valid response (" + (sig || code) + ")" + (detail ? ": " + detail : "")));
        return;
      }
      if (!payload || typeof payload.ok !== "boolean") {
        finalize(new Error("PhiShield: malformed child response"));
      } else if (!payload.ok) {
        finalize(new Error(payload.error?.message || "PhiShield: child execution failed"));
      } else if (code !== 0) {
        finalize(new Error("PhiShield: child exited with code " + code));
      } else {
        finalize(null, payload.value);
      }
    });
    child.stdin.on("error", () => {
      // A child may exit early; the close handler reports that failure.
    });
    if (signal?.aborted) {
      abort();
      return;
    }
    child.stdin.end(request);
  });
}

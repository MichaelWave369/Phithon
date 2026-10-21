/**
 * Runs the synchronous interpreter in a dedicated browser Worker.
 * The host terminates this worker to cancel execution or enforce a wall-clock limit.
 * Workers protect the UI from stalls; they are not an OS security sandbox.
 */
import { execute } from "./core.js";
import { analyzePackage } from "./package.js";

self.onmessage = (event) => {
  try {
    const { source, options } = event.data ?? {};
    analyzePackage(source, options?.modules ?? {});
    const value = execute(source, options);
    self.postMessage({ ok: true, value });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "Error",
        line: Number.isInteger(error?.line) ? error.line : null,
        column: Number.isInteger(error?.column) ? error.column : null
      }
    });
  }
};

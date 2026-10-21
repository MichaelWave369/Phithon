/**
 * Browser-only PhiThon program runner with a killable Worker and cancellation.
 *
 * Supplying workerFactory is reserved for tests. The default uses Vite's
 * worker-compatible new URL() syntax, bundling core/modules into worker output.
 *
 * This is UI/process separation, NOT a hardened security sandbox.
 */
export function runInWorker(
  source,
  { signal, timeoutMs = 2500, maxSteps = 30000, maxOutputChars = 12000, modules = {}, workerFactory } = {}
) {
  if (typeof source !== "string") return Promise.reject(new TypeError("PhiThon source must be text"));
  if (signal?.aborted) return Promise.reject(abortError());

  const duration = Number.isInteger(timeoutMs) && timeoutMs > 0
    ? Math.min(timeoutMs, 10000) : 2500;

  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = workerFactory
        ? workerFactory()
        : new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    } catch (error) {
      reject(error);
      return;
    }

    let done = false;
    let timer;
    function close(error, result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      if (error) reject(error);
      else resolve(result);
    }
    function onAbort() { close(abortError()); }
    timer = setTimeout(() => close(new Error("Program exceeded the " + duration + " ms time limit")), duration);
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event) => {
      const payload = event.data;
      if (!payload || typeof payload.ok !== "boolean") {
        close(new Error("Malformed PhiThon worker response"));
      } else if (payload.ok) {
        close(null, payload.value);
      } else {
        const err = new Error(payload.error?.message ?? "PhiThon worker error");
        err.name = payload.error?.name ?? "Error";
        if (Number.isInteger(payload.error?.line)) err.line = payload.error.line;
        if (Number.isInteger(payload.error?.column)) err.column = payload.error.column;
        close(err);
      }
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      close(new Error(event.message ?? "Worker execution failed"));
    };
    if (signal?.aborted) { onAbort(); return; }
    try { worker.postMessage({ source, options: { maxSteps, maxOutputChars, modules } }); }
    catch (error) { close(error); }
  });
}
function abortError() {
  const error = new Error("Program cancelled");
  error.name = "AbortError";
  return error;
}

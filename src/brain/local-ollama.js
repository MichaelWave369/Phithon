/**
 * PhiBrain R7: intentionally narrow local Ollama HTTP transport.
 *
 * This is the only Node module in R7 which can contact a model server.
 * It targets one literal IPv4 loopback address and fixed port/path, uses no
 * shell, proxy, redirect, DNS, credential, remote URL, or streaming protocol.
 * Browser PhiThon programs cannot import this Node module.
 */
import { request } from "node:http";

export const OLLAMA_ENDPOINT = "http://127.0.0.1:11434/api/generate";
export const MAX_RESPONSE_BYTES = 65_536;
export const MAX_GENERATED_CHARS = 8_192;
export const LOCAL_TIMEOUT_MS = 25_000;
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)*(?::[A-Za-z0-9][A-Za-z0-9_.-]*)?$/;

export function validateLocalModel(model) {
  if (typeof model !== "string" || model.length > 128 || !MODEL_PATTERN.test(model)) {
    throw new TypeError("PhiBrain: model must be a valid, explicit local Ollama model name");
  }
  return model;
}

/**
 * Send one single-turn generation. Caller is responsible for consent.
 * Never follow redirects; never resolve remote hosts; do not auto-pull models.
 */
export async function postLocalOllama({ model, prompt, signal, timeoutMs = LOCAL_TIMEOUT_MS, requestFactory = request }) {
  validateLocalModel(model);
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2048) {
    throw new TypeError("PhiBrain: prompt must be 1..2048 nonblank characters");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > LOCAL_TIMEOUT_MS) {
    throw new TypeError("PhiBrain: invalid local timeout");
  }
  if (signal?.aborted) throw new Error("PhiBrain: local request cancelled");
  const body = JSON.stringify({
    model, prompt,
    stream: false,
    options: { num_predict: 128 }
  });

  return await new Promise((resolve, reject) => {
    let settled = false, timer;
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      if (error) reject(error); else resolve(value);
    }
    const req = requestFactory({
      hostname: "127.0.0.1",
      port: 11434,
      path: "/api/generate",
      method: "POST",
      agent: false,
      headers: {
        "Host": "127.0.0.1:11434",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, response => {
      const status = response.statusCode;
      if (status !== 200) {
        response.resume();
        req.destroy(new Error("PhiBrain: local Ollama HTTP " + status + " (no redirects)"));
        return;
      }
      let total = 0;
      const buffers = [];
      response.on("data", chunk => {
        total += chunk.length;
        if (total > MAX_RESPONSE_BYTES) {
          req.destroy(new Error("PhiBrain: local response exceeds 64 KiB"));
          return;
        }
        buffers.push(chunk);
      });
      response.on("error", error => finish(error));
      response.on("end", () => {
        if (settled) return;
        try {
          const output = JSON.parse(Buffer.concat(buffers).toString("utf8"));
          if (!output || output.done !== true ||
              typeof output.response !== "string" ||
              output.response.length > MAX_GENERATED_CHARS ||
              typeof output.model !== "string" ||
              output.model !== model) {
            throw new Error("PhiBrain: malformed or mismatched Ollama response");
          }
          // Return only user-facing text, the model ID, and limited optional metrics.
          finish(null, {
            model: output.model,
            response: output.response,
            promptEvalCount: Number.isInteger(output.prompt_eval_count) && output.prompt_eval_count >= 0
              ? output.prompt_eval_count : null,
            evalCount: Number.isInteger(output.eval_count) && output.eval_count >= 0
              ? output.eval_count : null
          });
        } catch (error) { finish(error); }
      });
    });
    function cancel() { req.destroy(new Error("PhiBrain: local request cancelled")); }
    req.on("error", error => finish(error));
    signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => req.destroy(new Error("PhiBrain: local request timed out")), timeoutMs);
    req.end(body);
  });
}

/**
 * PhiBrain R7 dispatch orchestration. Dispatch is intentionally independent
 * of PhiThon execution and requires a second, host-side authorization.
 *
 * A valid handoff is NOT authorization. "local" is an intent label only.
 */
import { BRAIN_HANDOFF_SCHEMA, validateBrainRequests } from "./handoff.js";
import { postLocalOllama, validateLocalModel, OLLAMA_ENDPOINT } from "./local-ollama.js";

function exactKeys(object, fields, label) {
  if (!object || typeof object !== "object" || Array.isArray(object) ||
      Object.keys(object).sort().join(",") !== [...fields].sort().join(",")) {
    throw new TypeError("PhiBrain: " + label + " has missing or unexpected fields");
  }
}
export function validateLocalDispatch(handoff, { consent, model, requestId } = {}) {
  if (consent !== true) throw new Error("PhiBrain: explicit --confirm-local authorization required");
  exactKeys(handoff, ["schema", "status", "provenance", "delivery", "requests"], "handoff");
  if (handoff.schema !== BRAIN_HANDOFF_SCHEMA || handoff.status !== "NOT_SENT" ||
      handoff.delivery !== "MANUAL_EXPORT_ONLY" || handoff.provenance !== "SIMULATED") {
    throw new TypeError("PhiBrain: untrusted or already modified handoff envelope");
  }
  validateBrainRequests(handoff.requests);
  if (!Number.isInteger(requestId) || requestId < 1 || requestId > 5) {
    throw new TypeError("PhiBrain: --request must specify an ID from 1 to 5");
  }
  const item = handoff.requests.find(x => x.id === requestId);
  if (!item) throw new Error("PhiBrain: request ID does not exist in handoff");
  if (item.route !== "local") {
    throw new Error("PhiBrain: only requests marked 'local' can reach Ollama");
  }
  if (!item.prompt.trim()) throw new Error("PhiBrain: blank prompt forbidden");
  validateLocalModel(model);
  return { id: item.id, prompt: item.prompt, route: item.route, model };
}

export function makeDispatchJournal(item) {
  return {
    schema: "phithon.brain-local-dispatch.v1",
    status: "INTENT_RECORDED_NOT_YET_SENT",
    provenance: "UNVERIFIED",
    transport: "OLLAMA_LOOPBACK_ONLY",
    endpoint: OLLAMA_ENDPOINT,
    request: { id: item.id, route: item.route, model: item.model, prompt: item.prompt },
    response: null,
    error: null
  };
}

export async function dispatchAuthorizedLocal(item, { send = postLocalOllama } = {}) {
  // The selected item must come from validateLocalDispatch.
  if (!item || item.route !== "local" || !Number.isInteger(item.id) ||
      typeof item.prompt !== "string" || !item.prompt.trim() ||
      item.prompt.length > 2048) {
    throw new TypeError("PhiBrain: invalid selected local request");
  }
  validateLocalModel(item.model);
  const result = await send({ model: item.model, prompt: item.prompt });
  if (!result || typeof result.response !== "string" ||
      result.response.length > 8192 || result.model !== item.model) {
    throw new TypeError("PhiBrain: invalid transport result");
  }
  return {
    schema: "phithon.brain-local-dispatch.v1",
    status: "RESPONSE_RECORDED",
    provenance: "UNVERIFIED_MODEL_OUTPUT",
    transport: "OLLAMA_LOOPBACK_ONLY",
    endpoint: OLLAMA_ENDPOINT,
    request: { id: item.id, route: "local", model: item.model, prompt: item.prompt },
    response: {
      model: result.model,
      text: result.response,
      promptEvalCount: Number.isInteger(result.promptEvalCount) ? result.promptEvalCount : null,
      evalCount: Number.isInteger(result.evalCount) ? result.evalCount : null
    },
    error: null
  };
}

/**
 * PhiBrain R6 request-handoff protocol.
 *
 * Requests are inert data. Export does not dispatch or authenticate anything.
 * Routes describe *intent* only; no provider, network, filesystem or model
 * access is granted by this module.
 */
export const BRAIN_HANDOFF_SCHEMA = "phithon.brain-handoff.v1";
export const BRAIN_ROUTES = Object.freeze(["manual", "local", "spv"]);
export const MAX_BRAIN_REQUESTS = 5;
export const MAX_BRAIN_PROMPT = 2048;

export function validateBrainRequests(requests) {
  if (!Array.isArray(requests) || requests.length > MAX_BRAIN_REQUESTS) {
    throw new TypeError("PhiBrain: expected up to five requests");
  }
  for (let i = 0; i < requests.length; i++) {
    const r = requests[i];
    if (!r || typeof r !== "object" || Array.isArray(r) ||
      Object.keys(r).sort().join(",") !== "id,prompt,route" ||
      r.id !== i + 1 || !BRAIN_ROUTES.includes(r.route) ||
      typeof r.prompt !== "string" || r.prompt.length < 1 ||
      r.prompt.length > MAX_BRAIN_PROMPT) {
      throw new TypeError("PhiBrain: invalid request at index " + i);
    }
  }
  return requests;
}

/** Build a standalone, explicitly NOT_SENT envelope for manual handoff. */
export function makeBrainHandoff(requests) {
  validateBrainRequests(requests);
  if (requests.length === 0) throw new TypeError("PhiBrain: no requests to export");
  return {
    schema: BRAIN_HANDOFF_SCHEMA,
    status: "NOT_SENT",
    provenance: "SIMULATED",
    delivery: "MANUAL_EXPORT_ONLY",
    requests: requests.map(({ id, route, prompt }) => ({ id, route, prompt }))
  };
}

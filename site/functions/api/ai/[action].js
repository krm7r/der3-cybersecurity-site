import {
  addCorsIfNeeded,
  corsHeaders,
  json,
  methodResponse,
  missingSecret,
  proxyPath,
  readJsonBody,
  rejectOrigin,
  upstreamHeaders,
} from "../../_utils.js";

const AI_UPSTREAM = "https://der3-ai.al-94a.workers.dev";
const METHODS = "POST, OPTIONS";
const SECRET_NAME = "DER3_AI_WORKER_API_KEY";
const ACTIONS = new Set(["chat", "news", "message"]);

export async function onRequest(context) {
  const { request, env, params } = context;
  const originError = rejectOrigin(request);
  if (originError) return originError;
  if (request.method === "OPTIONS" || request.method !== "POST") {
    return methodResponse(request, METHODS);
  }
  const action = typeof params?.action === "string" ? params.action : "";
  if (!ACTIONS.has(action)) {
    return json({ error: "not_found" }, 404, corsHeaders(request.headers.get("Origin"), METHODS));
  }
  if (missingSecret(env, SECRET_NAME)) {
    return json({ error: "proxy_not_configured" }, 503, corsHeaders(request.headers.get("Origin"), METHODS));
  }

  const parsed = await readJsonBody(request);
  if (parsed.response) return addCorsIfNeeded(parsed.response, request, METHODS);
  if (parsed.body?.consent !== true) {
    return json({ error: "consent_required" }, 428, corsHeaders(request.headers.get("Origin"), METHODS));
  }

  const headers = upstreamHeaders(request, env[SECRET_NAME]);
  headers.set("Content-Type", "application/json");
  let response;
  try {
    response = await fetch(proxyPath(AI_UPSTREAM, `/api/ai/${encodeURIComponent(action)}`), {
      method: "POST",
      redirect: "manual",
      headers,
      body: parsed.text,
    });
  } catch {
    return json({ error: "upstream_unavailable" }, 502, corsHeaders(request.headers.get("Origin"), METHODS));
  }
  return addCorsIfNeeded(response, request, METHODS);
}

import {
  corsHeaders,
  json,
  methodResponse,
  missingSecret,
  proxyPath,
  rejectOrigin,
  upstreamHeaders,
} from "../../../../_utils.js";

const ANALYSIS_UPSTREAM = "https://der3-security-analysis.anlayzx-c1d.workers.dev";
const METHODS = "GET, OPTIONS";
const SECRET_NAME = "DER3_ANALYSIS_WORKER_API_KEY";
const SCAN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function onRequest(context) {
  const { request, env, params } = context;
  const originError = rejectOrigin(request);
  if (originError) return originError;
  if (request.method === "OPTIONS" || request.method !== "GET") {
    return methodResponse(request, METHODS);
  }
  if (missingSecret(env, SECRET_NAME)) {
    return json({ error: "proxy_not_configured" }, 503, corsHeaders(request.headers.get("Origin"), METHODS));
  }

  const scanId = typeof params?.scanId === "string" ? params.scanId : "";
  if (!SCAN_ID_RE.test(scanId)) {
    return json({ error: "invalid_scan_id" }, 400, corsHeaders(request.headers.get("Origin"), METHODS));
  }

  let response;
  try {
    response = await fetch(proxyPath(ANALYSIS_UPSTREAM, `/api/check/url/${encodeURIComponent(scanId)}/screenshot`), {
      method: "GET",
      redirect: "manual",
      headers: upstreamHeaders(request, env[SECRET_NAME]),
    });
  } catch {
    return json({ error: "upstream_unavailable" }, 502, corsHeaders(request.headers.get("Origin"), METHODS));
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

import {
  addCorsIfNeeded,
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
const ANALYSIS_ID_RE = /^[A-Za-z0-9_-]{1,256}$/;

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

  const analysisId = typeof params?.analysisId === "string" ? params.analysisId : "";
  if (!ANALYSIS_ID_RE.test(analysisId)) {
    return json({ error: "invalid_analysis_id" }, 400, corsHeaders(request.headers.get("Origin"), METHODS));
  }

  let response;
  try {
    response = await fetch(proxyPath(
      ANALYSIS_UPSTREAM,
      `/api/check/url/virustotal/${encodeURIComponent(analysisId)}`,
    ), {
      method: "GET",
      redirect: "manual",
      headers: upstreamHeaders(request, env[SECRET_NAME]),
    });
  } catch {
    return json({ error: "upstream_unavailable" }, 502, corsHeaders(request.headers.get("Origin"), METHODS));
  }
  return addCorsIfNeeded(response, request, METHODS);
}

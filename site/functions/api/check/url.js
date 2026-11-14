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

const ANALYSIS_UPSTREAM = "https://der3-security-analysis.anlayzx-c1d.workers.dev";
const METHODS = "POST, OPTIONS";
const SECRET_NAME = "DER3_ANALYSIS_WORKER_API_KEY";

export async function onRequest(context) {
  const { request, env } = context;
  const originError = rejectOrigin(request);
  if (originError) return originError;
  if (request.method !== "POST") return methodResponse(request, METHODS);
  if (missingSecret(env, SECRET_NAME)) {
    return json({ error: "proxy_not_configured" }, 503, corsHeaders(request.headers.get("Origin"), METHODS));
  }

  const parsed = await readJsonBody(request);
  if (parsed.response) return addCorsIfNeeded(parsed.response, request, METHODS);
  const mode = parsed.body?.mode || (parsed.body?.virusTotalConsent === true && parsed.body?.publicScanConsent === true
    ? "both"
    : parsed.body?.virusTotalConsent === true
      ? "virustotal"
      : parsed.body?.publicScanConsent === true
        ? "cloudflare"
        : "");
  if (["cloudflare", "both"].includes(mode) && parsed.body?.publicScanConsent !== true) {
    return json({ error: "public_scan_consent_required" }, 428, corsHeaders(request.headers.get("Origin"), METHODS));
  }
  if (["virustotal", "both"].includes(mode) && parsed.body?.virusTotalConsent !== true) {
    return json({ error: "virustotal_consent_required" }, 428, corsHeaders(request.headers.get("Origin"), METHODS));
  }

  const headers = upstreamHeaders(request, env[SECRET_NAME]);
  headers.set("Content-Type", "application/json");
  let response;
  try {
    response = await fetch(proxyPath(ANALYSIS_UPSTREAM, "/api/check/url"), {
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

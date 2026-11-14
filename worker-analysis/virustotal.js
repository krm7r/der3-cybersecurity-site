const VIRUSTOTAL_API = "https://www.virustotal.com/api/v3";
const ANALYSIS_ID_RE = /^[A-Za-z0-9_-]{1,256}$/;
const STATS_KEYS = ["malicious", "suspicious", "harmless", "undetected", "timeout", "confirmed-timeout", "failure", "type-unsupported"];

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function urlId(url) {
  const bytes = new TextEncoder().encode(url);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeStats(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const stats = {};
  for (const key of STATS_KEYS) {
    if (Number.isInteger(raw[key]) && raw[key] >= 0) stats[key] = raw[key];
  }
  return Object.keys(stats).length ? stats : null;
}

function verdict(stats) {
  if (!stats) return "unclassified";
  if ((stats.malicious ?? 0) > 0) return "malicious_signal";
  if ((stats.suspicious ?? 0) > 0) return "suspicious_signal";
  return "not_detected";
}

async function requestVirusTotal(url, init, env) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...(init?.headers ?? {}), "x-apikey": env.VIRUSTOTAL_API_KEY },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    const error = new Error("virustotal_unavailable");
    error.status = 502;
    throw error;
  }
  const data = await readJson(response);
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const error = new Error("virustotal_rate_limited");
    error.status = 429;
    error.retryAfterSeconds = Number.isInteger(retryAfter) && retryAfter > 0 ? retryAfter : 60;
    throw error;
  }
  if (!response.ok && response.status !== 404) {
    const error = new Error("virustotal_unavailable");
    error.status = response.status;
    throw error;
  }
  return { response, data };
}

export async function checkVirusTotalUrl(url, env) {
  if (!env.VIRUSTOTAL_API_KEY) {
    const error = new Error("virustotal_not_configured");
    error.status = 503;
    throw error;
  }
  const id = urlId(url);
  const lookup = await requestVirusTotal(`${VIRUSTOTAL_API}/urls/${encodeURIComponent(id)}`, { method: "GET" }, env);
  if (lookup.response.status === 404) {
    const form = new URLSearchParams({ url });
    const submission = await requestVirusTotal(`${VIRUSTOTAL_API}/urls`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    }, env);
    const analysisId = submission.data?.data?.id;
    if (typeof analysisId !== "string" || !ANALYSIS_ID_RE.test(analysisId)) {
      const error = new Error("virustotal_invalid_response");
      error.status = 502;
      throw error;
    }
    return {
      status: "queued",
      analysisId,
      resultEndpoint: `/api/check/url/virustotal/${encodeURIComponent(analysisId)}`,
      reportUrl: `https://www.virustotal.com/gui/url/${id}`,
      retryAfterSeconds: 10,
      caveat: "VirusTotal is scanning the submitted URL; a pending scan is not a verdict.",
    };
  }

  const attributes = lookup.data?.data?.attributes ?? {};
  const stats = normalizeStats(attributes.last_analysis_stats);
  return {
    status: "report_found",
    verdict: verdict(stats),
    stats,
    analyzedAt: Number.isInteger(attributes.last_analysis_date) ? attributes.last_analysis_date : null,
    reportUrl: `https://www.virustotal.com/gui/url/${id}`,
    caveat: "No detections is not proof that a URL is safe, especially for new or unreported URLs.",
  };
}

export async function getVirusTotalAnalysis(analysisId, env) {
  if (!env.VIRUSTOTAL_API_KEY) {
    const error = new Error("virustotal_not_configured");
    error.status = 503;
    throw error;
  }
  if (typeof analysisId !== "string" || !ANALYSIS_ID_RE.test(analysisId)) {
    const error = new Error("invalid_analysis_id");
    error.status = 400;
    throw error;
  }
  const { data } = await requestVirusTotal(`${VIRUSTOTAL_API}/analyses/${encodeURIComponent(analysisId)}`, { method: "GET" }, env);
  const attributes = data?.data?.attributes ?? {};
  const analysisStatus = typeof attributes.status === "string" ? attributes.status : "queued";
  const complete = analysisStatus.toLowerCase() === "completed";
  const stats = normalizeStats(attributes.stats);
  return {
    status: complete ? "complete" : "processing",
    analysisStatus,
    analysisId,
    verdict: complete ? verdict(stats) : "unclassified",
    stats,
    retryAfterSeconds: complete ? null : 10,
    caveat: "A completed analysis with no detections is not proof that a URL is safe.",
  };
}

import { checkVirusTotalUrl, getVirusTotalAnalysis } from "./virustotal.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};
const PAGES_ORIGIN = "https://der3-cybersecurity-site.pages.dev";
const LOCAL_ORIGIN_RE = /^http:\/\/localhost(?::\d+)?$/;
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const SCANNER_ROOT = "/urlscanner/v2";
const MAX_BODY_BYTES = 16000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VT_ANALYSIS_ID_RE = /^[A-Za-z0-9_-]{1,256}$/;
const MODES = new Set(["cloudflare", "virustotal", "both"]);
const SENSITIVE_QUERY_KEY_RE = /(?:token|secret|password|passwd|pwd|api[_-]?key|authorization|auth|session|sessionid|sid|jwt|signature|sig|ticket|otp|verification|reset|code|state|email|phone|cookie|credential|oauth|^key$)/i;

function json(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...cors },
  });
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function isNonPublicIpv4(value) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113);
}

function mappedIpv4FromIpv6(host) {
  const tail = host.match(/^::ffff:(.+)$/i)?.[1];
  if (!tail) return null;
  if (tail.includes(".")) return tail;
  const groups = tail.split(":");
  if (groups.length !== 2 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null;
  const high = Number.parseInt(groups[0], 16);
  const low = Number.parseInt(groups[1], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function corsHeaders(origin) {
  if (!origin) return {};
  if (origin === PAGES_ORIGIN || LOCAL_ORIGIN_RE.test(origin)) {
    return {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "access-control-max-age": "86400",
      vary: "Origin",
    };
  }
  return null;
}

function parseTarget(value) {
  if (typeof value !== "string" || value.length > 2048 || value.trim() !== value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol)) return null;
  if (url.username || url.password || url.hash) return null;
  if (url.port && !["80", "443"].includes(url.port)) return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (isNonPublicIpv4(host)) return null;
  const mappedIpv4 = mappedIpv4FromIpv6(host);
  if (mappedIpv4 && isNonPublicIpv4(mappedIpv4)) return null;
  if (host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || /^fe[89ab]/.test(host) || host.startsWith("ff")) return null;
  return url.toString();
}

function hasSensitiveQueryParameter(value) {
  const url = new URL(value);
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEY_RE.test(key.toLowerCase())) return true;
  }
  return false;
}

function scannerUrl(env, path) {
  return `${CLOUDFLARE_API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}${SCANNER_ROOT}${path}`;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function readJsonBody(request) {
  const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json" && !contentType.endsWith("+json")) {
    return { error: "json_content_type_required", status: 415 };
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { error: "request_too_large", status: 413 };
  }
  if (!request.body) return { error: "invalid_json", status: 400 };

  const reader = request.body.getReader();
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_BODY_BYTES) {
        await reader.cancel();
        return { error: "request_too_large", status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    try { await reader.cancel(); } catch { /* Ignore cancellation errors. */ }
    return { error: "invalid_json", status: 400 };
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { body: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { error: "invalid_json", status: 400 };
  }
}

async function submitScan(url, env) {
  const response = await fetch(scannerUrl(env, "/scan"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.CLOUDFLARE_URL_SCANNER_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ url, visibility: "Public", screenshotsResolutions: ["desktop"] }),
    signal: AbortSignal.timeout(12000),
  });
  const data = await readJson(response);
  if (!response.ok || !data?.uuid) {
    const error = new Error("cloudflare_scanner_unavailable");
    error.status = response.status;
    throw error;
  }
  return data.uuid;
}

async function scanResult(scanId, env) {
  const response = await fetch(scannerUrl(env, `/result/${scanId}`), {
    headers: { authorization: `Bearer ${env.CLOUDFLARE_URL_SCANNER_TOKEN}` },
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) return { pending: true };
  if (!response.ok) throw new Error("scanner_result_failed");
  return { pending: false, data: await readJson(response) };
}

function cleanPublicUrl(value) {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const parsed = new URL(value);
    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEY_RE.test(key.toLowerCase())) parsed.searchParams.set(key, "[redacted]");
    }
    return parsed.toString().slice(0, 2048);
  } catch {
    return null;
  }
}

function safeResult(data, scanId) {
  const task = data?.task ?? {};
  const page = data?.page ?? {};
  const overall = data?.verdicts?.overall ?? {};
  const malicious = overall.malicious === true;
  const redirects = Array.isArray(page.history)
    ? page.history.slice(0, 20).map((entry) => cleanPublicUrl(typeof entry === "string" ? entry : entry?.url)).filter(Boolean)
    : [];
  return {
    status: task.status ?? "Finished",
    scanSucceeded: task.success !== false,
    verdict: malicious ? "malicious" : overall.malicious === false ? "not_detected" : "unclassified",
    malicious,
    categories: Array.isArray(overall.categories) ? overall.categories.slice(0, 20) : [],
    threatTags: Array.isArray(overall.tags) ? overall.tags.slice(0, 20) : [],
    submittedUrl: cleanPublicUrl(task.url),
    finalUrl: cleanPublicUrl(page.url),
    redirects,
    screenshotUrl: `/api/check/url/${scanId}/screenshot`,
    reportUrl: `https://radar.cloudflare.com/scan/${scanId}/summary`,
    caveat: "A verdict of not_detected or unclassified is not proof that a URL is safe.",
  };
}

async function checkModeLimit(request, env, provider) {
  if (!env.URL_SCAN_LIMITER) return;
  const clientIp = request.headers.get("x-der3-client-ip") || request.headers.get("cf-connecting-ip");
  if (!clientIp) {
    const error = new Error("rate_limit_context_unavailable");
    error.status = 503;
    throw error;
  }
  try {
    const { success } = await env.URL_SCAN_LIMITER.limit({ key: `${provider}:${clientIp}` });
    if (!success) {
      const error = new Error("rate_limited");
      error.status = 429;
      error.retryAfterSeconds = 10;
      throw error;
    }
  } catch (error) {
    if (error.status) throw error;
    const unavailable = new Error("rate_limit_unavailable");
    unavailable.status = 503;
    throw unavailable;
  }
}

function providerError(error) {
  const httpStatus = Number.isInteger(error?.status) ? error.status : 502;
  return {
    status: httpStatus === 429 ? "rate_limited" : "unavailable",
    httpStatus,
    ...(Number.isInteger(error?.retryAfterSeconds) ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
  };
}

async function runCloudflare(request, target, env) {
  if (!env.CLOUDFLARE_URL_SCANNER_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    return { status: "not_configured", publicScan: true };
  }
  try {
    await checkModeLimit(request, env, "cloudflare");
    const scanId = await submitScan(target, env);
    return {
      status: "queued",
      scanId,
      scanner: "Cloudflare URL Scanner",
      publicScan: true,
      reportUrl: `https://radar.cloudflare.com/scan/${scanId}/summary`,
      resultEndpoint: `/api/check/url/${scanId}`,
      screenshotEndpoint: `/api/check/url/${scanId}/screenshot`,
    };
  } catch (error) {
    return { ...providerError(error), publicScan: true };
  }
}

async function runVirusTotal(request, target, env) {
  if (!env.VIRUSTOTAL_API_KEY) return { status: "not_configured", communityDataset: true };
  try {
    await checkModeLimit(request, env, "virustotal");
    return { ...(await checkVirusTotalUrl(target, env)), communityDataset: true };
  } catch (error) {
    return { ...providerError(error), communityDataset: true };
  }
}

function overallModeStatus(results) {
  const values = Object.values(results);
  if (values.some((result) => result.status === "queued")) return { status: "queued", httpStatus: 202 };
  const failures = values.filter((result) => ["unavailable", "not_configured", "rate_limited"].includes(result.status));
  if (failures.length === values.length) {
    return { status: "failed", httpStatus: failures.some((result) => result.status === "rate_limited") ? 429 : 502 };
  }
  if (failures.length) return { status: "partial", httpStatus: 200 };
  return { status: "complete", httpStatus: 200 };
}

async function handleCheck(request, env, cors) {
  const parsed = await readJsonBody(request);
  if (parsed.error) return json({ error: parsed.error }, parsed.status, cors);
  const body = parsed.body;

  const target = parseTarget(body?.url);
  if (!target) return json({ error: "invalid_public_http_url" }, 400, cors);
  let mode = body?.mode;
  if (!mode) {
    mode = body?.virusTotalConsent === true && body?.publicScanConsent === true
      ? "both"
      : body?.virusTotalConsent === true
        ? "virustotal"
        : body?.publicScanConsent === true
          ? "cloudflare"
          : "";
  }
  if (!MODES.has(mode)) return json({ error: "invalid_mode", allowedModes: Array.from(MODES) }, 400, cors);

  const needsVirusTotal = mode === "virustotal" || mode === "both";
  const needsCloudflare = mode === "cloudflare" || mode === "both";
  if (needsVirusTotal && body?.virusTotalConsent !== true) {
    return json({ error: "virustotal_consent_required", message: "VirusTotal API lookups and submissions are added to its community dataset." }, 428, cors);
  }
  if (needsCloudflare && body?.publicScanConsent !== true) {
    return json({ error: "public_scan_consent_required", message: "Cloudflare URL Scanner reports are public." }, 428, cors);
  }
  if (hasSensitiveQueryParameter(target)) {
    return json({ error: "sensitive_url_not_sent", message: "Remove sensitive query parameters before sending this URL to an external scanner." }, 400, cors);
  }

  const results = {};
  if (needsVirusTotal) results.virusTotal = await runVirusTotal(request, target, env);
  if (needsCloudflare) results.cloudflare = await runCloudflare(request, target, env);
  const overall = overallModeStatus(results);
  return json({
    mode,
    status: overall.status,
    verdict: results.virusTotal?.verdict ?? "unclassified",
    submittedUrl: target,
    providers: results,
    caveat: "No detection is not proof that a URL is safe, especially for a new or unreported URL.",
  }, overall.httpStatus, cors);
}

async function handleVirusTotalAnalysis(analysisId, env, cors) {
  try {
    const result = await getVirusTotalAnalysis(analysisId, env);
    return json(result, result.status === "processing" ? 202 : 200, cors);
  } catch (error) {
    const failure = providerError(error);
    return json({ error: failure.status, httpStatus: failure.httpStatus, retryAfterSeconds: failure.retryAfterSeconds }, failure.httpStatus === 400 ? 400 : failure.httpStatus === 429 ? 429 : failure.httpStatus === 503 ? 503 : 502, cors);
  }
}

async function handleResult(scanId, env, cors) {
  if (!UUID_RE.test(scanId)) return json({ error: "invalid_scan_id" }, 400, cors);
  try {
    const result = await scanResult(scanId, env);
    if (result.pending) return json({ status: "processing", scanId, retryAfterSeconds: 10 }, 202, cors);
    if (!result.data) return json({ error: "invalid_scanner_response" }, 502, cors);
    const normalized = safeResult(result.data, scanId);
    return json(normalized, ["Queued", "InProgress", "Running"].includes(normalized.status) ? 202 : 200, cors);
  } catch {
    return json({ error: "scanner_result_unavailable" }, 502, cors);
  }
}

async function handleScreenshot(scanId, env, cors) {
  if (!UUID_RE.test(scanId)) return json({ error: "invalid_scan_id" }, 400, cors);
  try {
    const response = await fetch(scannerUrl(env, `/screenshots/${scanId}.png?resolution=desktop`), {
      headers: { authorization: `Bearer ${env.CLOUDFLARE_URL_SCANNER_TOKEN}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return json({ error: response.status === 404 ? "screenshot_not_ready" : "screenshot_unavailable" }, response.status === 404 ? 202 : 502, cors);
    return new Response(response.body, {
      status: 200,
      headers: { ...cors, "content-type": "image/png", "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch {
    return json({ error: "screenshot_unavailable" }, 502, cors);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get("origin"));
    if (cors === null) return json({ error: "origin_not_allowed" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors ?? {} });

    if (request.method === "GET" && url.pathname === "/health") {
      const cloudflareScanner = Boolean(env.CLOUDFLARE_URL_SCANNER_TOKEN && env.CLOUDFLARE_ACCOUNT_ID);
      const virusTotal = Boolean(env.VIRUSTOTAL_API_KEY);
      const proxyAuthConfigured = Boolean(env.API_KEY);
      return json({
        worker: "der3-security-analysis",
        configured: cloudflareScanner && virusTotal && proxyAuthConfigured,
        cloudflareScanner,
        virusTotal,
        proxyAuthConfigured,
        webRisk: false,
      }, 200, cors ?? {});
    }

    if (!env.API_KEY) return json({ error: "proxy_auth_not_configured" }, 503, cors ?? {});
    if (!constantTimeEqual(request.headers.get("x-api-key"), env.API_KEY)) {
      return json({ error: "unauthorized" }, 401, cors ?? {});
    }

    if (request.method === "POST" && url.pathname === "/api/check/url") return handleCheck(request, env, cors ?? {});

    const vtMatch = url.pathname.match(/^\/api\/check\/url\/virustotal\/([^/]+)$/);
    if (request.method === "GET" && vtMatch) {
      let analysisId;
      try {
        analysisId = decodeURIComponent(vtMatch[1]);
      } catch {
        return json({ error: "invalid_analysis_id" }, 400, cors ?? {});
      }
      if (!VT_ANALYSIS_ID_RE.test(analysisId)) return json({ error: "invalid_analysis_id" }, 400, cors ?? {});
      return handleVirusTotalAnalysis(analysisId, env, cors ?? {});
    }

    const match = url.pathname.match(/^\/api\/check\/url\/([^/]+)(\/screenshot)?$/);
    if (request.method === "GET" && match) {
      if (!env.CLOUDFLARE_URL_SCANNER_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) return json({ error: "scanner_not_configured" }, 503, cors ?? {});
      return match[2] ? handleScreenshot(match[1], env, cors ?? {}) : handleResult(match[1], env, cors ?? {});
    }

    return json({ error: "not_found" }, 404, cors ?? {});
  },
};

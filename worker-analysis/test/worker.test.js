import test from "node:test";
import assert from "node:assert/strict";
import worker from "../index.js";

const scanId = "095be615-a8ad-4c33-8e9c-c7612fbf6c9f";
const accountId = "c1d93f57cae70d680a28ceccbc88f638";
const scanUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/urlscanner/v2/scan`;
const resultUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/urlscanner/v2/result/${scanId}`;
const screenshotUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/urlscanner/v2/screenshots/${scanId}.png?resolution=desktop`;
const vtBase = "https://www.virustotal.com/api/v3";
const origin = "https://der3-cybersecurity-site.pages.dev";
const env = {
  CLOUDFLARE_ACCOUNT_ID: accountId,
  CLOUDFLARE_URL_SCANNER_TOKEN: "test-cloudflare-token",
  VIRUSTOTAL_API_KEY: "test-virustotal-key",
  WEBRISK_API_KEY: "test-webrisk-key",
  API_KEY: "test-proxy-key",
  URL_SCAN_LIMITER: { limit: async () => ({ success: true }) },
};

const makeRequest = (path, { method = "GET", body, requestOrigin = origin, apiKey = "test-proxy-key", headers = {} } = {}) => new Request(`https://worker.test${path}`, {
  method,
  headers: {
    ...(body === undefined ? {} : { "content-type": "application/json" }),
    ...(requestOrigin === null ? {} : { origin: requestOrigin }),
    ...(apiKey === null ? {} : { "x-api-key": apiKey }),
    ...headers,
  },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

function stubFetch(handler) {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = oldFetch; };
}

function vtId(url) {
  return Buffer.from(url).toString("base64url");
}

test("health reports both provider bindings without exposing secret values", async () => {
  const response = await worker.fetch(makeRequest("/health"), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.configured, true);
  assert.equal(body.virusTotal, true);
  assert.equal(body.cloudflareScanner, true);
  assert.equal(body.webRisk, false);
  assert.equal(body.proxyAuthConfigured, true);
  assert.equal(JSON.stringify(body).includes("test-virustotal-key"), false);
  assert.equal(JSON.stringify(body).includes("test-cloudflare-token"), false);
});

test("rejects missing or incorrect proxy credentials before provider calls", async () => {
  let calls = 0;
  const restore = stubFetch(async () => { calls += 1; return Response.json({}); });
  try {
    const missing = await worker.fetch(makeRequest("/api/check/url", {
      method: "POST", body: { url: "https://example.com", mode: "cloudflare", publicScanConsent: true }, apiKey: null,
    }), env);
    assert.equal(missing.status, 401);
    assert.equal((await missing.json()).error, "unauthorized");

    const incorrect = await worker.fetch(makeRequest("/api/check/url", {
      method: "POST", body: { url: "https://example.com", mode: "cloudflare", publicScanConsent: true }, apiKey: "wrong",
    }), env);
    assert.equal(incorrect.status, 401);

    const unconfigured = await worker.fetch(makeRequest("/api/check/url", {
      method: "POST", body: { url: "https://example.com", mode: "cloudflare", publicScanConsent: true },
    }), { ...env, API_KEY: undefined });
    assert.equal(unconfigured.status, 503);
    assert.equal((await unconfigured.json()).error, "proxy_auth_not_configured");
    assert.equal(calls, 0);
  } finally { restore(); }
});

test("rejects unsupported origins before contacting providers", async () => {
  let calls = 0;
  const restore = stubFetch(async () => { calls += 1; return Response.json({}); });
  try {
    const response = await worker.fetch(makeRequest("/api/check/url", {
      method: "POST", body: { url: "https://example.com", mode: "both", virusTotalConsent: true, publicScanConsent: true }, requestOrigin: "https://attacker.example",
    }), env);
    assert.equal(response.status, 403);
    assert.equal(calls, 0);
  } finally { restore(); }
});

test("requires a supported mode and explicit consent before any external lookup", async () => {
  let calls = 0;
  const restore = stubFetch(async () => { calls += 1; return Response.json({}); });
  try {
    const noMode = await worker.fetch(makeRequest("/api/check/url", { method: "POST", body: { url: "https://example.com" } }), env);
    assert.equal(noMode.status, 400);
    assert.equal((await noMode.json()).error, "invalid_mode");

    const noConsent = await worker.fetch(makeRequest("/api/check/url", {
      method: "POST", body: { url: "https://example.com", mode: "virustotal" },
    }), env);
    assert.equal(noConsent.status, 428);
    assert.equal((await noConsent.json()).error, "virustotal_consent_required");
    assert.equal(calls, 0);
  } finally { restore(); }
});

test("rejects local, malformed, and sensitive-query URLs before external providers", async () => {
  let calls = 0;
  const restore = stubFetch(async () => { calls += 1; return Response.json({}); });
  try {
    for (const url of ["file:///etc/passwd", "http://127.0.0.1/", "http://192.168.1.4/", "http://100.64.0.1/", "http://198.18.0.1/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/", "https://user:pass@example.com/", "https://example.com:8443/"]) {
      const response = await worker.fetch(makeRequest("/api/check/url", {
        method: "POST", body: { url, mode: "virustotal", virusTotalConsent: true },
      }), env);
      assert.equal(response.status, 400, url);
    }
    const sensitive = await worker.fetch(makeRequest("/api/check/url", {
      method: "POST", body: { url: "https://example.com/?access_token=private", mode: "both", virusTotalConsent: true, publicScanConsent: true },
    }), env);
    assert.equal(sensitive.status, 400);
    assert.equal((await sensitive.json()).error, "sensitive_url_not_sent");
    assert.equal(calls, 0);
  } finally { restore(); }
});

test("Cloudflare-only mode submits a public scan and does not call VirusTotal or Web Risk", async () => {
  let calls = 0;
  const restore = stubFetch(async (input, init = {}) => {
    calls += 1;
    const url = new URL(input);
    assert.equal(url.toString(), scanUrl);
    assert.equal(init.method, "POST");
    assert.equal(init.headers.authorization, "Bearer test-cloudflare-token");
    const payload = JSON.parse(init.body);
    assert.equal(payload.url, "https://news.example/path");
    assert.equal(payload.visibility, "Public");
    assert.deepEqual(payload.screenshotsResolutions, ["desktop"]);
    return Response.json({ uuid: scanId, visibility: "public" });
  });
  try {
    const response = await worker.fetch(makeRequest("/api/check/url", {
      method: "POST", body: { url: "https://news.example/path", mode: "cloudflare", publicScanConsent: true },
      headers: { "x-der3-client-ip": "203.0.113.4" },
    }), env);
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(body.mode, "cloudflare");
    assert.equal(body.providers.cloudflare.status, "queued");
    assert.equal(body.providers.cloudflare.scanId, scanId);
    assert.equal(calls, 1);
  } finally { restore(); }
});

test("VirusTotal-only mode queries a report with the key in a header and maps engine counts", async () => {
  const target = "https://example.org/path?ref=der3";
  const expectedUrl = `${vtBase}/urls/${vtId(target)}`;
  let calls = 0;
  const restore = stubFetch(async (input, init = {}) => {
    calls += 1;
    assert.equal(new URL(input).toString(), expectedUrl);
    assert.equal(init.method, "GET");
    assert.equal(init.headers["x-apikey"], "test-virustotal-key");
    assert.equal(new URL(input).searchParams.has("key"), false);
    return Response.json({ data: { attributes: {
      last_analysis_stats: { malicious: 2, suspicious: 1, harmless: 50, undetected: 10 },
      last_analysis_date: 1761000000,
    } } });
  });
  try {
    const response = await worker.fetch(makeRequest("/api/check/url", {
      method: "POST", body: { url: target, mode: "virustotal", virusTotalConsent: true },
      headers: { "cf-connecting-ip": "203.0.113.5" },
    }), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.providers.virusTotal.status, "report_found");
    assert.equal(body.providers.virusTotal.verdict, "malicious_signal");
    assert.equal(body.providers.virusTotal.stats.malicious, 2);
    assert.equal(body.providers.virusTotal.reportUrl, `${vtBase.replace("/api/v3", "")}/gui/url/${vtId(target)}`);
    assert.equal(calls, 1);
  } finally { restore(); }
});

test("VirusTotal submits a URL only when the report does not exist and returns a polling endpoint", async () => {
  const target = "https://new.example/path";
  const calls = [];
  const restore = stubFetch(async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, init });
    assert.equal(init.headers["x-apikey"], "test-virustotal-key");
    if (init.method === "GET") return Response.json({ error: { code: "NotFoundError" } }, { status: 404 });
    assert.equal(url.toString(), `${vtBase}/urls`);
    assert.equal(init.headers["content-type"], "application/x-www-form-urlencoded");
    assert.equal(new URLSearchParams(init.body).get("url"), target);
    return Response.json({ data: { id: "u-analysis-123" } });
  });
  try {
    const response = await worker.fetch(makeRequest("/api/check/url", {
      method: "POST", body: { url: target, mode: "virustotal", virusTotalConsent: true },
      headers: { "cf-connecting-ip": "203.0.113.6" },
    }), env);
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(body.providers.virusTotal.status, "queued");
    assert.equal(body.providers.virusTotal.analysisId, "u-analysis-123");
    assert.equal(body.providers.virusTotal.resultEndpoint, "/api/check/url/virustotal/u-analysis-123");
    assert.equal(calls.length, 2);
  } finally { restore(); }
});

test("both mode runs VirusTotal and Cloudflare independently with their separate consents", async () => {
  const target = "https://der3-example.invalid/";
  const calls = [];
  const restore = stubFetch(async (input, init = {}) => {
    const url = new URL(input);
    calls.push(url.toString());
    if (url.hostname === "www.virustotal.com") {
      assert.equal(init.headers["x-apikey"], "test-virustotal-key");
      return Response.json({ data: { attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 4, undetected: 3 } } } });
    }
    assert.equal(url.toString(), scanUrl);
    assert.equal(init.headers.authorization, "Bearer test-cloudflare-token");
    return Response.json({ uuid: scanId });
  });
  try {
    const response = await worker.fetch(makeRequest("/api/check/url", {
      method: "POST", body: { url: target, mode: "both", virusTotalConsent: true, publicScanConsent: true },
      headers: { "cf-connecting-ip": "203.0.113.7" },
    }), env);
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(body.mode, "both");
    assert.equal(body.providers.virusTotal.status, "report_found");
    assert.equal(body.providers.cloudflare.status, "queued");
    assert.equal(calls.length, 2);
  } finally { restore(); }
});

test("rate limit prevents provider requests", async () => {
  let calls = 0;
  const limitedEnv = { ...env, URL_SCAN_LIMITER: { limit: async ({ key }) => ({ success: !key.startsWith("virustotal:") }) } };
  const restore = stubFetch(async () => { calls += 1; return Response.json({}); });
  try {
    const response = await worker.fetch(makeRequest("/api/check/url", {
      method: "POST", body: { url: "https://example.com", mode: "virustotal", virusTotalConsent: true },
      headers: { "cf-connecting-ip": "203.0.113.8" },
    }), limitedEnv);
    const body = await response.json();
    assert.equal(response.status, 429);
    assert.equal(body.providers.virusTotal.status, "rate_limited");
    assert.equal(calls, 0);
  } finally { restore(); }
});

test("VirusTotal processing endpoint returns a completed analysis", async () => {
  const restore = stubFetch(async (input, init = {}) => {
    assert.equal(new URL(input).toString(), `${vtBase}/analyses/u-analysis-123`);
    assert.equal(init.headers["x-apikey"], "test-virustotal-key");
    return Response.json({ data: { attributes: { status: "completed", stats: { malicious: 0, suspicious: 1, harmless: 9, undetected: 20 } } } });
  });
  try {
    const response = await worker.fetch(makeRequest("/api/check/url/virustotal/u-analysis-123"), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, "complete");
    assert.equal(body.analysisStatus, "completed");
    assert.equal(body.verdict, "suspicious_signal");
    assert.equal(body.stats.suspicious, 1);
  } finally { restore(); }
});

test("existing Cloudflare result endpoint reports redirects and keeps no-match non-safe", async () => {
  const restore = stubFetch(async (input) => {
    assert.equal(new URL(input).toString(), resultUrl);
    return Response.json({
      task: { status: "Finished", url: "https://short.example/" },
      page: { url: "https://destination.example/?access_token=private", history: [{ url: "https://short.example/" }, { url: "https://destination.example/" }, { url: "https://destination.example/?code=private" }] },
      verdicts: { overall: { malicious: false, categories: ["Information Technology"], tags: [] } },
    });
  });
  try {
    const response = await worker.fetch(makeRequest(`/api/check/url/${scanId}`), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.verdict, "not_detected");
    assert.equal(body.finalUrl, "https://destination.example/?access_token=%5Bredacted%5D");
    assert.equal(body.redirects.length, 3);
    assert.equal(body.redirects[2], "https://destination.example/?code=%5Bredacted%5D");
    assert.doesNotMatch(JSON.stringify(body), /private/);
    assert.match(body.caveat, /not proof/i);
  } finally { restore(); }
});

test("Cloudflare screenshot endpoint proxies only PNG bytes with no-store headers", async () => {
  const restore = stubFetch(async (input, init = {}) => {
    assert.equal(new URL(input).toString(), screenshotUrl);
    assert.equal(init.headers.authorization, "Bearer test-cloudflare-token");
    return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
  });
  try {
    const response = await worker.fetch(makeRequest(`/api/check/url/${scanId}/screenshot`), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([137, 80, 78, 71]));
  } finally { restore(); }
});

test("direct analysis rejects non-JSON requests and enforces actual body bytes up to 16KB", async () => {
  let providerCalls = 0;
  const restore = stubFetch(async () => { providerCalls++; return Response.json({ uuid: scanId }); });
  try {
    const oversized = new Request("https://worker.test/api/check/url", {
      method: "POST",
      headers: {
        origin,
        "x-api-key": env.API_KEY,
        "content-type": "application/json",
        "content-length": "1",
      },
      body: JSON.stringify({
        url: "https://example.com",
        mode: "cloudflare",
        publicScanConsent: true,
        padding: "x".repeat(16000),
      }),
    });
    const largeResponse = await worker.fetch(oversized, env);
    assert.equal(largeResponse.status, 413);
    assert.equal((await largeResponse.json()).error, "request_too_large");

    const wrongType = new Request("https://worker.test/api/check/url", {
      method: "POST",
      headers: { origin, "x-api-key": env.API_KEY, "content-type": "text/plain" },
      body: "{}",
    });
    const typeResponse = await worker.fetch(wrongType, env);
    assert.equal(typeResponse.status, 415);
    assert.equal((await typeResponse.json()).error, "json_content_type_required");
    assert.equal(providerCalls, 0);
  } finally { restore(); }
});

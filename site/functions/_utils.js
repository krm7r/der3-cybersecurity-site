const PRODUCTION_ORIGIN = "https://der3-cybersecurity-site.pages.dev";
const LOCAL_ORIGIN_RE = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
const MAX_JSON_BODY_BYTES = 16000;

export function allowedOrigin(origin) {
  return !origin || origin === PRODUCTION_ORIGIN || LOCAL_ORIGIN_RE.test(origin);
}

export function corsHeaders(origin, methods) {
  if (!origin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": methods,
    "access-control-allow-headers": "Content-Type, X-API-Key",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

export function rejectOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!allowedOrigin(origin)) {
    return json({ error: "origin_not_allowed" }, 403);
  }
  return null;
}

export function methodResponse(request, methods) {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin, methods),
    });
  }
  return json({ error: "method_not_allowed" }, 405, {
    Allow: methods,
    ...corsHeaders(origin, methods),
  });
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

export function missingSecret(env, name) {
  return typeof env?.[name] !== "string" || env[name].length === 0;
}

export function upstreamHeaders(request, apiKey) {
  const headers = new Headers({
    "X-API-Key": apiKey,
  });
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("X-Der3-Client-IP", clientIp);
  const origin = request.headers.get("Origin");
  if (origin) headers.set("Origin", origin);
  return headers;
}

export async function readJsonBody(request) {
  const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json" && !contentType.endsWith("+json")) {
    return { response: json({ error: "json_content_type_required" }, 415) };
  }

  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    return { response: json({ error: "request_too_large" }, 413) };
  }

  if (!request.body) return { response: json({ error: "invalid_json" }, 400) };
  const reader = request.body.getReader();
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        return { response: json({ error: "request_too_large" }, 413) };
      }
      chunks.push(value);
    }
  } catch {
    try { await reader.cancel(); } catch { /* Ignore cancellation errors. */ }
    return { response: json({ error: "invalid_json" }, 400) };
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { response: json({ error: "invalid_json" }, 400) };
  }
  return { body, text: JSON.stringify(body) };
}

export function addCorsIfNeeded(response, request, methods) {
  const origin = request.headers.get("Origin");
  if (!origin) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin, methods))) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function proxyPath(base, path) {
  return `${base}${path}`;
}

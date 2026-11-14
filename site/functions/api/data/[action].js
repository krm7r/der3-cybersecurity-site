import { allowedOrigin, corsHeaders, json, methodResponse, readJsonBody } from "../../_utils.js";

const DATA_UPSTREAM = "https://der3-data-api.datas-b50.workers.dev";
const METHODS = "GET,POST,OPTIONS";

export async function onRequest(context) {
  const { request, params, env } = context;
  const origin = request.headers.get("Origin") || "";
  if (!allowedOrigin(origin)) return json({ error: "origin_not_allowed" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin, METHODS) });
  if (!["GET", "POST"].includes(request.method)) return methodResponse(request, METHODS);

  const action = String(params.action || "");
  const route = ["login", "register", "logout", "me", "reports"].includes(action)
    ? (action === "me" ? "/auth/me" : action === "reports" ? "/reports" : `/auth/${action}`)
    : "";
  if (!route) return json({ error: "not_found" }, 404);

  const headers = new Headers({ accept: "application/json" });
  if (origin) headers.set("Origin", origin);
  const cookie = request.headers.get("Cookie");
  if (cookie) headers.set("Cookie", cookie);

  let body;
  if (request.method === "POST") {
    const parsed = await readJsonBody(request);
    if (parsed.response) return parsed.response;
    body = parsed.text;
    headers.set("content-type", "application/json");
  }

  try {
    const upstream = await fetch(`${DATA_UPSTREAM}${route}`, {
      method: request.method,
      headers,
      body,
    });
    const responseHeaders = new Headers({
      "cache-control": "no-store",
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      ...corsHeaders(origin, METHODS),
    });
    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) responseHeaders.set("set-cookie", setCookie);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return json({ error: "data_service_unavailable" }, 503);
  }
}

const MAX_BODY_BYTES = 16_000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const COOKIE_NAME = "der3_session";
const ALLOWED_ORIGINS = new Set([
  "https://der3-cybersecurity-site.pages.dev",
]);
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,40}$/;
const REPORT_TYPES = new Set(["site", "news", "threat", "phone"]);
const DB_CATEGORIES = new Set(["phishing", "scam", "malware", "account", "privacy", "other"]);

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  },
});

function originHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  if (!origin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    vary: "Origin",
  };
}

function allowedOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  return !origin || ALLOWED_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function response(request, data, status = 200, headers = {}) {
  return json(data, status, { ...originHeaders(request), ...headers });
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64url(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/") + "===".slice((String(value).length + 3) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hashPassword(password) {
  // 100k is the OWASP PBKDF2-HMAC-SHA256 floor used here; keep auth within Workers CPU limits.
  const iterations = 100_000;
  const salt = randomBytes(16);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return `pbkdf2-sha256$${iterations}$${base64url(salt)}$${base64url(new Uint8Array(bits))}`;
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function verifyPassword(password, encoded) {
  const [algorithm, iterationText, saltText, hashText] = String(encoded || "").split("$");
  const iterations = Number(iterationText);
  if (algorithm !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 100_000 || !saltText || !hashText) return false;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: fromBase64url(saltText), iterations, hash: "SHA-256" }, key, 256);
    return constantTimeEqual(base64url(new Uint8Array(bits)), hashText);
  } catch {
    return false;
  }
}

function parseCookies(request) {
  const cookies = {};
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0) cookies[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return cookies;
}

function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${COOKIE_NAME}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

async function createSession(env, userId) {
  const rawToken = base64url(randomBytes(32));
  const tokenHash = base64url(await sha256(rawToken));
  await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, datetime('now', ?))")
    .bind(base64url(randomBytes(16)), userId, tokenHash, `+${SESSION_TTL_SECONDS} seconds`).run();
  return rawToken;
}

async function currentUser(request, env) {
  const rawToken = parseCookies(request)[COOKIE_NAME];
  if (!rawToken) return null;
  const tokenHash = base64url(await sha256(rawToken));
  const row = await env.DB.prepare(
    "SELECT u.id, u.username, u.account_status FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.account_status = 'active' LIMIT 1",
  ).bind(tokenHash).first();
  return row || null;
}

async function readBody(request) {
  const length = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return { error: "request_too_large" };
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) return { error: "request_too_large" };
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return { error: "invalid_json" }; }
}

function clean(value, max) { return String(value ?? "").trim().slice(0, max); }
function normalizeUsername(value) { return clean(value, 40).toLowerCase(); }
function reportCategory(type) {
  if (type === "threat" || type === "phone") return "scam";
  if (type === "news") return "privacy";
  return "other";
}

async function register(request, env, body) {
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  if (!USERNAME_RE.test(username)) return response(request, { error: "invalid_username" }, 400);
  if (password.length < 10 || password.length > 256) return response(request, { error: "invalid_password" }, 400);
  const passwordHash = await hashPassword(password);
  const userId = base64url(randomBytes(16));
  try {
    await env.DB.prepare("INSERT INTO users (id, username, password_hash, password_algo) VALUES (?, ?, ?, 'pbkdf2-sha256')")
      .bind(userId, username, passwordHash).run();
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("unique")) return response(request, { error: "username_taken" }, 409);
    throw error;
  }
  const token = await createSession(env, userId);
  return response(request, { user: { id: userId, username }, authenticated: true }, 201, { "set-cookie": sessionCookie(token) });
}

async function login(request, env, body) {
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  const user = await env.DB.prepare("SELECT id, username, password_hash, failed_login_count, locked_until FROM users WHERE username = ? LIMIT 1").bind(username).first();
  if (!user || (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) || !(await verifyPassword(password, user?.password_hash))) {
    if (user) await env.DB.prepare("UPDATE users SET failed_login_count = failed_login_count + 1, locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN datetime('now', '+15 minutes') ELSE locked_until END, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();
    return response(request, { error: "invalid_credentials" }, 401);
  }
  await env.DB.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();
  const token = await createSession(env, user.id);
  return response(request, { user: { id: user.id, username: user.username }, authenticated: true }, 200, { "set-cookie": sessionCookie(token) });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!allowedOrigin(request)) return response(request, { error: "origin_not_allowed" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: originHeaders(request) });
    if (!env.DB) return response(request, { error: "service_not_configured" }, 503);

    try {
      if (request.method === "GET" && pathname === "/health") {
        return response(request, { worker: "der3-data-api", status: "ready", implemented: true, d1BindingConfigured: true });
      }
      if (request.method === "POST" && pathname === "/auth/register") {
        const body = await readBody(request); if (body?.error) return response(request, body, body.error === "request_too_large" ? 413 : 400);
        return register(request, env, body);
      }
      if (request.method === "POST" && pathname === "/auth/login") {
        const body = await readBody(request); if (body?.error) return response(request, body, body.error === "request_too_large" ? 413 : 400);
        return login(request, env, body);
      }
      if (request.method === "POST" && pathname === "/auth/logout") {
        const rawToken = parseCookies(request)[COOKIE_NAME];
        if (rawToken) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(base64url(await sha256(rawToken))).run();
        return response(request, { authenticated: false }, 200, { "set-cookie": sessionCookie("", 0) });
      }
      if (request.method === "GET" && pathname === "/auth/me") {
        const user = await currentUser(request, env);
        return response(request, { authenticated: Boolean(user), user: user ? { id: user.id, username: user.username } : null });
      }

      const user = await currentUser(request, env);
      if (!user) return response(request, { error: "authentication_required" }, 401);

      if (request.method === "POST" && pathname === "/reports") {
        const body = await readBody(request); if (body?.error) return response(request, body, body.error === "request_too_large" ? 413 : 400);
        const reportType = clean(body.reportType, 20);
        const title = clean(body.title, 120);
        const description = clean(body.description, 1200);
        const reportedUrl = clean(body.reportedUrl, 2048) || null;
        const evidence = clean(body.evidence, 2000) || null;
        if (!REPORT_TYPES.has(reportType) || title.length < 3 || description.length < 5) return response(request, { error: "invalid_report" }, 400);
        const id = base64url(randomBytes(16));
        const dedupHash = base64url(await sha256(`${user.id}|${reportType}|${title.toLowerCase()}|${reportedUrl || ""}`));
        const existing = await env.DB.prepare("SELECT id, status, created_at FROM reports WHERE user_id = ? AND dedup_hash = ? ORDER BY created_at DESC LIMIT 1").bind(user.id, dedupHash).first();
        if (existing) return response(request, { error: "duplicate_report", report: existing }, 409);
        await env.DB.prepare("INSERT INTO reports (id, user_id, report_type, category, title, description, reported_url, evidence, dedup_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(id, user.id, reportType, reportCategory(reportType), title, description, reportedUrl, evidence, dedupHash).run();
        return response(request, { report: { id, reportType, title, status: "new", createdAt: new Date().toISOString() } }, 201);
      }
      if (request.method === "GET" && pathname === "/reports") {
        const rows = await env.DB.prepare("SELECT id, report_type AS reportType, category, title, description, reported_url AS reportedUrl, severity, status, reviewer_note AS reviewerNote, created_at AS createdAt, updated_at AS updatedAt FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(user.id).all();
        return response(request, { reports: rows.results || [] });
      }
      return response(request, { error: "not_found" }, 404);
    } catch (error) {
      console.error("data_worker_error", error);
      return response(request, { error: "internal_error" }, 500);
    }
  },
};

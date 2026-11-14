const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";

/**
 * Check a password against HIBP Pwned Passwords using k-anonymity.
 * The password is UTF-8 encoded and hashed locally. Only the first five
 * hexadecimal characters of the SHA-1 hash are sent; suffix comparison stays
 * in this browser. The input and full hash are never persisted by this module.
 */
export async function checkPwnedPassword(password, fetchImpl = globalThis.fetch) {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("empty_password");
  }
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") {
    throw new Error("crypto_unavailable");
  }

  const bytes = new TextEncoder().encode(password);
  const digest = await globalThis.crypto.subtle.digest("SHA-1", bytes);
  const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  let response;
  try {
    response = await fetchImpl(`${HIBP_RANGE_URL}${prefix}`, {
      method: "GET",
      headers: {
        Accept: "text/plain",
        "Add-Padding": "true",
      },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("service_unavailable");
  }

  if (response.status === 429) throw new Error("rate_limited");
  if (!response.ok) throw new Error("service_unavailable");

  const body = await response.text();
  for (const line of body.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const candidate = line.slice(0, separator).trim().toUpperCase();
    if (candidate !== suffix) continue;
    const count = Number.parseInt(line.slice(separator + 1).trim(), 10);
    if (Number.isSafeInteger(count) && count > 0) return { count };
  }
  return { count: 0 };
}

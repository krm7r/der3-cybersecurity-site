import test from "node:test";
import assert from "node:assert/strict";
import { checkPwnedPassword } from "./breach-check.js";

const PASSWORD = "password";
const SHA1_SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

test("sends only the five-character hash prefix and compares the suffix locally", async () => {
  let requestedUrl = "";
  let requestedInit;
  const result = await checkPwnedPassword(PASSWORD, async (url, init) => {
    requestedUrl = String(url);
    requestedInit = init;
    return new Response(`00000000000000000000000000000000000:0\n${SHA1_SUFFIX}:3\n`, { status: 200 });
  });

  assert.equal(requestedUrl, "https://api.pwnedpasswords.com/range/5BAA6");
  assert.equal(new URL(requestedUrl).pathname, "/range/5BAA6");
  assert.equal(new URL(requestedUrl).search, "");
  assert.equal(requestedInit.headers["Add-Padding"], "true");
  assert.equal(requestedInit.cache, "no-store");
  assert.equal(requestedInit.credentials, "omit");
  assert.deepEqual(result, { count: 3 });
});

test("returns zero when the full hash suffix is not in the range response", async () => {
  const result = await checkPwnedPassword(PASSWORD, async () =>
    new Response(`00000000000000000000000000000000000:0\n`, { status: 200 }),
  );
  assert.deepEqual(result, { count: 0 });
});

test("rejects an empty password without making a request", async () => {
  let requested = false;
  await assert.rejects(
    checkPwnedPassword("", async () => { requested = true; }),
    { message: "empty_password" },
  );
  assert.equal(requested, false);
});

test("surfaces provider throttling and service failures", async () => {
  await assert.rejects(
    checkPwnedPassword(PASSWORD, async () => new Response("", { status: 429 })),
    { message: "rate_limited" },
  );
  await assert.rejects(
    checkPwnedPassword(PASSWORD, async () => new Response("", { status: 503 })),
    { message: "service_unavailable" },
  );
});

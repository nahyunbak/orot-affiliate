import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { NextRequest } from "next/server.js";
const require = createRequire(import.meta.url);
const source = await readFile(
  new URL("../src/lib/web-auth-server.ts", import.meta.url),
  "utf8",
);
const code = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replaceAll(
    '"next/server"',
    JSON.stringify(pathToFileURL(require.resolve("next/server.js")).href),
  );
const { authAction } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const origin = "http://localhost:3005";
const request = (action, { body = {}, headers = {} } = {}) =>
  new NextRequest(`${origin}/api/auth/${action}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

test("rejects cross-origin auth before contacting the backend", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Must not call upstream");
  });
  assert.equal(
    (
      await authAction(
        request("anonymous", {
          headers: { origin: "https://untrusted.example" },
        }),
        "anonymous",
      )
    ).status,
    403,
  );
  assert.equal(fetch.mock.callCount(), 0);
});
test("guest session keeps refresh token only in the HttpOnly cookie", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ accessToken: "access", refreshToken: "secret-refresh" }),
  );
  const response = await authAction(request("anonymous"), "anonymous");
  assert.deepEqual(await response.json(), { accessToken: "access" });
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /template_refresh=secret-refresh/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=strict/i);
  assert.match(cookie, /Path=\/api\/auth/);
  assert.equal(
    JSON.parse(fetch.mock.calls[0].arguments[1].body).initialPlatform,
    "WEB",
  );
});
test("missing refresh cookie cannot create a session", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Must not call upstream");
  });
  assert.equal((await authAction(request("refresh"), "refresh")).status, 401);
  assert.equal(fetch.mock.callCount(), 0);
});
test("refresh rotates the HttpOnly token and never returns it to JavaScript", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ accessToken: "next-access", refreshToken: "next-refresh" }),
  );
  const response = await authAction(
    request("refresh", { headers: { cookie: "template_refresh=old-refresh" } }),
    "refresh",
  );
  assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body), {
    refreshToken: "old-refresh",
  });
  assert.deepEqual(await response.json(), { accessToken: "next-access" });
  assert.match(
    response.headers.get("set-cookie"),
    /template_refresh=next-refresh/,
  );
});
test("OAuth state mismatch is rejected before provider exchange", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Must not call upstream");
  });
  const challenge = encodeURIComponent(
    JSON.stringify({ provider: "google", state: "expected", nonce: "nonce" }),
  );
  const response = await authAction(
    request("google", {
      headers: { cookie: `template_oauth=${challenge}` },
      body: { state: "wrong", idToken: "token" },
    }),
    "google",
  );
  assert.equal(response.status, 400);
  assert.equal(fetch.mock.callCount(), 0);
});
test("malformed upstream tokens are not stored", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ accessToken: "access" }),
  );
  const response = await authAction(request("anonymous"), "anonymous");
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("an unconfigured OAuth provider returns a recoverable unavailable response", async (t) => {
  const previous = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  t.after(() => {
    if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previous;
  });
  const response = await authAction(
    request("challenge", { body: { provider: "google" } }),
    "challenge",
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { message: "auth.unavailable" });
});

test("successful CommonResponse token DTO is unwrapped without exposing refresh token", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      success: true,
      data: { accessToken: "access", refreshToken: "refresh" },
    }),
  );
  const response = await authAction(request("anonymous"), "anonymous");
  assert.deepEqual(await response.json(), { accessToken: "access" });
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
});
test("guest linking rejects email without token proof", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Must not call upstream");
  });
  const challenge = encodeURIComponent(
    JSON.stringify({ provider: "google", state: "expected", nonce: "nonce" }),
  );
  const response = await authAction(
    request("google", {
      headers: { cookie: `template_oauth=${challenge}` },
      body: {
        state: "expected",
        idToken: "token",
        anonymousEmail: "guest@example.invalid",
      },
    }),
    "google",
  );
  assert.equal(response.status, 400);
  assert.equal(fetch.mock.callCount(), 0);
});
test("guest linking forwards the email and possession proof together", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      accessToken: "linked-access",
      refreshToken: "linked-refresh",
    }),
  );
  const challenge = encodeURIComponent(
    JSON.stringify({ provider: "google", state: "expected", nonce: "nonce" }),
  );
  const idToken = `header.${Buffer.from(JSON.stringify({ nonce: "nonce" })).toString("base64url")}.signature`;
  const response = await authAction(
    request("google", {
      headers: { cookie: `template_oauth=${challenge}` },
      body: {
        state: "expected",
        idToken,
        anonymousEmail: "guest@example.invalid",
        anonymousAccessToken: "guest-proof",
      },
    }),
    "google",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body), {
    idToken,
    initialPlatform: "WEB",
    anonymousEmail: "guest@example.invalid",
    anonymousAccessToken: "guest-proof",
  });
});

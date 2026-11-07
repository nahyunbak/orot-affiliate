import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(
  new URL("../src/fetch/constants.ts", import.meta.url),
  "utf8",
);
const code = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    /import[^;]+from "@\/zustand\/auth";/,
    "const authGet = globalThis.__transportTest.authGet;",
  )
  .replace(
    /import[^;]+from "@\/lib\/web-auth-client";/,
    "const { refreshSession, getAuthGeneration } = globalThis.__transportTest;",
  );
let revision = 0;
let refreshed = 0;
globalThis.__transportTest = {
  authGet: { accessToken: () => (refreshed ? "fresh-access" : "old-access") },
  getAuthGeneration: () => revision,
  refreshSession: async () => {
    refreshed++;
    return "fresh-access";
  },
};
const { fetchWithAuth } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
test("rejects an old account response arriving after account switch", async (t) => {
  let resolve;
  t.mock.method(
    globalThis,
    "fetch",
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = fetchWithAuth("/user/mypage");
  revision++;
  resolve(Response.json({ id: 1 }));
  await assert.rejects(pending, { name: "AbortError" });
});
test("retries a 401 once with the rotated access token", async (t) => {
  refreshed = 0;
  const seen = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    seen.push(init.headers.get("authorization"));
    return seen.length === 1
      ? Response.json({}, { status: 401 })
      : Response.json({ id: 2 });
  });
  assert.deepEqual(await fetchWithAuth("/user/mypage"), { id: 2 });
  assert.deepEqual(seen, ["Bearer old-access", "Bearer fresh-access"]);
  assert.equal(refreshed, 1);
});
test("expired session cannot loop refresh indefinitely", async (t) => {
  refreshed = 0;
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({}, { status: 401 }),
  );
  await assert.rejects(fetchWithAuth("/user/mypage"));
  assert.equal(fetch.mock.callCount(), 2);
  assert.equal(refreshed, 1);
});
test("refresh responses are also discarded if the account changed", async (t) => {
  let resolve;
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = fetchWithAuth("/user/mypage");
  revision++;
  resolve(Response.json({}, { status: 401 }));
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(fetch.mock.callCount(), 1);
});

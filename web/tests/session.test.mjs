import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const state = { accessToken: "", revision: 0, hydrated: false };
globalThis.__sessionTest = {
  authGet: {
    accessToken: () => state.accessToken,
    revision: () => state.revision,
    hydrated: () => state.hydrated,
  },
  authSet: {
    accessToken: (token) => {
      state.accessToken = token;
      state.hydrated = true;
    },
    session: (token) => {
      state.accessToken = token;
      state.hydrated = true;
      state.revision++;
    },
    reset: () => {
      state.accessToken = "";
      state.hydrated = true;
      state.revision++;
    },
  },
};
const source = await readFile(
  new URL("../src/lib/web-auth-client.ts", import.meta.url),
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
    "const { authGet, authSet } = globalThis.__sessionTest;",
  );
const session = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const token = (id) =>
  `header.${Buffer.from(JSON.stringify({ id })).toString("base64url")}.signature`;
test("login and logout clear the registered account cache", () => {
  let cleared = 0;
  const unregister = session.registerAuthCacheClear(() => cleared++);
  session.establishSession(token(1));
  session.resetClientSession();
  assert.equal(cleared, 2);
  assert.equal(state.accessToken, "");
  unregister();
});
test("late refresh cannot replace a newly established account", async (t) => {
  session.establishSession(token(1));
  let resolve;
  t.mock.method(
    globalThis,
    "fetch",
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = session.refreshSession();
  session.establishSession(token(2));
  resolve(Response.json({ accessToken: token(1) }));
  assert.equal(await pending, null);
  assert.equal(state.accessToken, token(2));
});
test("refresh into another account invalidates the cache and revision", async (t) => {
  session.establishSession(token(1));
  let cleared = 0;
  const unregister = session.registerAuthCacheClear(() => cleared++);
  const revision = state.revision;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ accessToken: token(2) }),
  );
  assert.equal(await session.refreshSession(), token(2));
  assert.equal(cleared, 1);
  assert.equal(state.revision, revision + 1);
  unregister();
});
test("concurrent 401 refresh callers share one rotation", async (t) => {
  session.establishSession(token(2));
  let resolve;
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const a = session.refreshSession();
  const b = session.refreshSession();
  resolve(Response.json({ accessToken: token(2) }));
  assert.deepEqual(await Promise.all([a, b]), [token(2), token(2)]);
  assert.equal(fetch.mock.callCount(), 1);
});

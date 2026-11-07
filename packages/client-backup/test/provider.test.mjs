import assert from "node:assert/strict";
import test from "node:test";
import {
  BackupNotFoundError,
  BackupUnavailableError,
  MemoryBackupProvider,
  UnavailableBackupProvider,
} from "../dist/index.js";

const metadata = { createdAt: "2026-08-10T00:00:00.000Z", schemaVersion: 1, byteLength: 3 };

test("memory provider copies bytes and returns the latest descriptor", async () => {
  const provider = new MemoryBackupProvider();
  const source = new Uint8Array([1, 2, 3]);
  const first = await provider.save(source, metadata);
  source[0] = 9;
  const loaded = await provider.load(first.id);
  assert.deepEqual([...loaded], [1, 2, 3]);
  loaded[1] = 9;
  assert.deepEqual([...(await provider.load(first.id))], [1, 2, 3]);
  assert.deepEqual(await provider.latest(), first);
  await assert.rejects(() => provider.load("missing"), BackupNotFoundError);
});

test("unavailable provider exposes capability reason and typed failures", async () => {
  const provider = new UnavailableBackupProvider("cloud-x", "not supported on this platform");
  assert.deepEqual(await provider.capabilities(), { available: false, reason: "not supported on this platform" });
  await assert.rejects(() => provider.save(new Uint8Array(), metadata), BackupUnavailableError);
  await assert.rejects(() => provider.latest(), BackupUnavailableError);
  await assert.rejects(() => provider.load("x"), BackupUnavailableError);
});

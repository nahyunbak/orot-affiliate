import assert from "node:assert/strict";
import test from "node:test";
import {
  BackupUnavailableError,
  GoogleDriveAppDataProvider,
  ICloudBackupProvider,
} from "../dist/index.js";

const metadata = {
  createdAt: "2026-08-10T00:00:00.000Z",
  schemaVersion: 1,
  byteLength: 2,
};

test("Google Drive provider uses only injected appDataFolder operations", async () => {
  const calls = [];
  const transport = {
    capabilities: async () => ({ available: true }),
    uploadAppData: async (name, bytes, value) => {
      calls.push(["upload", name, [...bytes]]);
      return { id: "drive-1", metadata: value };
    },
    listAppData: async (name) => {
      calls.push(["list", name]);
      return [
        { id: "older", metadata: { ...metadata, createdAt: "2026-08-09T00:00:00.000Z" } },
        { id: "newer", metadata },
      ];
    },
    downloadAppData: async (id) => {
      calls.push(["download", id]);
      return new Uint8Array([4, 2]);
    },
  };
  const provider = new GoogleDriveAppDataProvider(transport, "snapshot.json");
  assert.equal((await provider.save(new Uint8Array([1, 2]), metadata)).id, "drive-1");
  assert.equal((await provider.latest()).id, "newer");
  assert.deepEqual([...(await provider.load("drive-1"))], [4, 2]);
  assert.deepEqual(calls, [
    ["upload", "snapshot.json", [1, 2]],
    ["list", "snapshot.json"],
    ["download", "drive-1"],
  ]);
});

test("iCloud provider requires an available injected native transport", async () => {
  const provider = new ICloudBackupProvider({
    capabilities: async () => ({ available: false, reason: "iCloud account is unavailable" }),
    writeAtomic: async () => assert.fail("must not write"),
    list: async () => assert.fail("must not list"),
    read: async () => assert.fail("must not read"),
  });
  assert.deepEqual(await provider.capabilities(), {
    available: false,
    reason: "iCloud account is unavailable",
  });
  await assert.rejects(
    () => provider.save(new Uint8Array([1]), metadata),
    BackupUnavailableError,
  );
});

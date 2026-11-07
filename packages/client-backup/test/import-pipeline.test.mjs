import assert from "node:assert/strict";
import test from "node:test";
import {
  BackupImportPipeline,
  MigrationChain,
  RecordMerger,
  Sha256Checksum,
  createEnvelope,
  encodeEnvelope,
} from "../dist/index.js";

test("import pipeline previews before its single commit mutation", async () => {
  const checksum = new Sha256Checksum();
  const envelope = await createEnvelope(
    { items: [{ id: "a", label: "incoming" }] },
    { schemaVersion: 1, createdAt: "2026-08-10T00:00:00.000Z", appVersion: "1" },
    checksum,
  );
  let stored = [{ id: "a", label: "local" }];
  let commits = 0;
  const merger = new RecordMerger({
    idOf: (item) => item.id,
    createId: (id, occupied) => {
      let suffix = 2;
      while (occupied.has(`${id}-${suffix}`)) suffix += 1;
      return `${id}-${suffix}`;
    },
    remapRelationships: (items, idMap) =>
      items.map((item) => ({ ...item, id: idMap.get(item.id) })),
  });
  const pipeline = new BackupImportPipeline({
    targetVersion: 1,
    checksum,
    migrations: new MigrationChain([]),
    parsePayload: (payload) => payload.items,
    merger,
    store: {
      readAll: async () => stored,
      commitAll: async (records) => {
        commits += 1;
        stored = [...records];
      },
    },
  });

  const prepared = await pipeline.prepare(encodeEnvelope(envelope), "merge");
  assert.equal(commits, 0);
  assert.deepEqual(prepared.preview.conflictIds, ["a"]);
  const result = await pipeline.commit(prepared);
  assert.equal(commits, 1);
  assert.deepEqual(result.records, [
    { id: "a", label: "local" },
    { id: "a-2", label: "incoming" },
  ]);
});

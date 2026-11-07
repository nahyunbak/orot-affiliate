import assert from "node:assert/strict";
import test from "node:test";
import { DuplicateIdError, RecordMerger } from "../dist/index.js";

function makeMerger() {
  return new RecordMerger({
    idOf: (record) => record.id,
    createId: (source, occupied) => {
      let suffix = 2;
      while (occupied.has(`${source}-${suffix}`)) suffix += 1;
      return `${source}-${suffix}`;
    },
    remapRelationships: (records, idMap) =>
      records.map((record) => ({
        ...record,
        id: idMap.get(record.id),
        parentId: record.parentId ? idMap.get(record.parentId) ?? record.parentId : undefined,
      })),
  });
}

test("safe merge builds the complete ID map before remapping relationships", () => {
  const merger = makeMerger();
  const local = [{ id: "a", label: "local" }, { id: "b", label: "occupied" }];
  const incoming = [
    { id: "a", label: "incoming" },
    { id: "child", label: "linked", parentId: "a" },
  ];
  const result = merger.merge(local, incoming, "merge");
  assert.deepEqual([...result.idMap], [["a", "a-2"], ["child", "child"]]);
  assert.deepEqual(result.records, [
    ...local,
    { id: "a-2", label: "incoming", parentId: undefined },
    { id: "child", label: "linked", parentId: "a-2" },
  ]);
  assert.deepEqual(result.preview.conflictIds, ["a"]);
  assert.equal(result.preview.preserveCount, 2);
});

test("replace preview reports removals and replace discards local records", () => {
  const merger = makeMerger();
  const local = [{ id: "same" }, { id: "old" }];
  const incoming = [{ id: "same" }];
  const preview = merger.preview(local, incoming, "replace");
  assert.deepEqual(preview, {
    mode: "replace",
    localCount: 2,
    incomingCount: 1,
    conflictIds: ["same"],
    addCount: 1,
    preserveCount: 0,
    removeCount: 2,
  });
  assert.deepEqual(merger.merge(local, incoming, "replace").records, [{ id: "same", parentId: undefined }]);
});

test("duplicate IDs are rejected before mutation", () => {
  const merger = makeMerger();
  assert.throws(() => merger.merge([], [{ id: "x" }, { id: "x" }], "merge"), DuplicateIdError);
  assert.throws(() => merger.preview([{ id: "x" }, { id: "x" }], [], "merge"), DuplicateIdError);
});

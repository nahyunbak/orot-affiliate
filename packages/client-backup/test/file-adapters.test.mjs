import assert from "node:assert/strict";
import test from "node:test";
import {
  CsvCodec,
  JsonFileAdapter,
  Sha256Checksum,
  StrictCsvFileAdapter,
  createEnvelope,
} from "../dist/index.js";

function memoryFileTransport() {
  let bytes = new Uint8Array();
  return {
    capabilities: async () => ({ available: true }),
    saveFile: async (_name, _type, data) => {
      bytes = data.slice();
    },
    openFile: async () => bytes.slice(),
  };
}

test("JSON file adapter validates the envelope on import", async () => {
  const transport = memoryFileTransport();
  const adapter = new JsonFileAdapter(transport);
  const checksum = new Sha256Checksum();
  const envelope = await createEnvelope(
    { entries: [{ id: "one" }] },
    { schemaVersion: 1, createdAt: "2026-08-10T00:00:00.000Z", appVersion: "1" },
    checksum,
  );
  await adapter.export("backup.json", envelope);
  assert.deepEqual(await adapter.import(1, checksum), envelope);
});

test("strict CSV file adapter uses the caller's exact schema", async () => {
  const transport = memoryFileTransport();
  const codec = new CsvCodec([
    { key: "id", header: "item_id", required: true, serialize: (item) => item.id, parse: String },
    { key: "label", header: "label", serialize: (item) => item.label, parse: String },
  ]);
  const adapter = new StrictCsvFileAdapter(transport, codec);
  const records = [{ id: "a", label: "Café, 서울" }];
  await adapter.export("items.csv", records);
  assert.deepEqual(await adapter.import(), records);
});

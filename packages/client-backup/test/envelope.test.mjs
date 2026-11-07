import assert from "node:assert/strict";
import test from "node:test";
import {
  CanonicalJsonError,
  ChecksumMismatchError,
  MigrationChain,
  Sha256Checksum,
  UnsupportedVersionError,
  canonicalJson,
  createEnvelope,
  decodeEnvelope,
  encodeEnvelope,
} from "../dist/index.js";

const checksum = new Sha256Checksum();

test("canonical JSON sorts object keys recursively and preserves array order", () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: [3, 1] } }), '{"a":{"x":[3,1],"y":2},"z":1}');
  assert.throws(() => canonicalJson({ invalid: undefined }), CanonicalJsonError);
});

test("snapshot envelope has a stable SHA-256 round trip", async () => {
  const payload = { entries: [{ id: "α", label: "한글 🧭" }], enabled: true };
  const envelope = await createEnvelope(
    payload,
    { schemaVersion: 1, createdAt: "2026-08-10T00:00:00.000Z", appVersion: "2.4.0" },
    checksum,
  );
  assert.match(envelope.checksum, /^sha256:[a-f0-9]{64}$/u);
  const decoded = await decodeEnvelope(encodeEnvelope(envelope), 1, checksum);
  assert.deepEqual(decoded, envelope);
});

test("checksum mismatch is rejected", async () => {
  const envelope = await createEnvelope(
    { values: [1, 2] },
    { schemaVersion: 1, createdAt: "2026-08-10T00:00:00.000Z", appVersion: "1" },
    checksum,
  );
  const tampered = new TextEncoder().encode(JSON.stringify({ ...envelope, payload: { values: [1, 3] } }));
  await assert.rejects(() => decodeEnvelope(tampered, 1, checksum), ChecksumMismatchError);
});

test("ordered migrations reach the requested version", async () => {
  const envelope = await createEnvelope(
    { title: "draft" },
    { schemaVersion: 1, createdAt: "2026-08-10T00:00:00.000Z", appVersion: "1" },
    checksum,
  );
  const migrations = new MigrationChain([
    { fromVersion: 1, toVersion: 2, migrate: (value) => ({ ...value, state: "open" }) },
    { fromVersion: 2, toVersion: 3, migrate: (value) => ({ ...value, revision: 3 }) },
  ]);
  const migrated = await decodeEnvelope(encodeEnvelope(envelope), 3, checksum, migrations);
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.payload, { title: "draft", state: "open", revision: 3 });
});

test("newer and unreachable versions are rejected", async () => {
  const envelope = await createEnvelope(
    { value: 1 },
    { schemaVersion: 2, createdAt: "2026-08-10T00:00:00.000Z", appVersion: "1" },
    checksum,
  );
  await assert.rejects(() => decodeEnvelope(encodeEnvelope(envelope), 1, checksum), UnsupportedVersionError);
  await assert.rejects(() => decodeEnvelope(encodeEnvelope(envelope), 3, checksum), UnsupportedVersionError);
});

import { canonicalJson, decodeUtf8, encodeUtf8, type JsonValue } from "./canonical-json.js";
import { checksumJson, checksumsEqual, type Checksum } from "./checksum.js";

export const BACKUP_FORMAT = "client-backup" as const;

export interface BackupEnvelope<T extends JsonValue> {
  readonly format: typeof BACKUP_FORMAT;
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly appVersion: string;
  readonly checksum: string;
  readonly payload: T;
}

export interface BackupMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(payload: JsonValue): JsonValue;
}

export interface MigrationPort {
  migrate(payload: JsonValue, fromVersion: number, toVersion: number): JsonValue;
}

export class BackupEnvelopeError extends Error {}
export class ChecksumMismatchError extends BackupEnvelopeError {}
export class UnsupportedVersionError extends BackupEnvelopeError {}

export class MigrationChain implements MigrationPort {
  constructor(private readonly migrations: readonly BackupMigration[]) {}

  migrate(payload: JsonValue, fromVersion: number, toVersion: number): JsonValue {
    let value = payload;
    let version = fromVersion;
    while (version < toVersion) {
      const migration = this.migrations.find((candidate) => candidate.fromVersion === version);
      if (!migration || migration.toVersion <= version || migration.toVersion > toVersion) {
        throw new UnsupportedVersionError(`No migration from schema version ${version}`);
      }
      value = migration.migrate(value);
      version = migration.toVersion;
    }
    if (version !== toVersion) throw new UnsupportedVersionError(`Cannot migrate to schema version ${toVersion}`);
    return value;
  }
}

export interface CreateEnvelopeOptions {
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly appVersion: string;
}

export async function createEnvelope<T extends JsonValue>(
  payload: T,
  options: CreateEnvelopeOptions,
  checksum: Checksum,
): Promise<BackupEnvelope<T>> {
  assertPositiveVersion(options.schemaVersion);
  assertIsoDate(options.createdAt);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: options.schemaVersion,
    createdAt: options.createdAt,
    appVersion: options.appVersion,
    checksum: await checksumJson(payload, checksum),
    payload,
  };
}

export function encodeEnvelope(envelope: BackupEnvelope<JsonValue>): Uint8Array {
  return encodeUtf8(canonicalJson(envelope));
}

export async function decodeEnvelope(
  data: Uint8Array,
  targetVersion: number,
  checksum: Checksum,
  migrations: MigrationPort = new MigrationChain([]),
): Promise<BackupEnvelope<JsonValue>> {
  let raw: unknown;
  try {
    raw = JSON.parse(decodeUtf8(data));
  } catch (error) {
    throw new BackupEnvelopeError(`Invalid backup JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const envelope = parseEnvelope(raw);
  const actualChecksum = await checksumJson(envelope.payload, checksum);
  if (!checksumsEqual(envelope.checksum, actualChecksum)) throw new ChecksumMismatchError("Backup checksum mismatch");
  if (envelope.schemaVersion > targetVersion) {
    throw new UnsupportedVersionError(`Schema version ${envelope.schemaVersion} is newer than ${targetVersion}`);
  }
  if (envelope.schemaVersion === targetVersion) return envelope;
  const payload = migrations.migrate(envelope.payload, envelope.schemaVersion, targetVersion);
  return { ...envelope, schemaVersion: targetVersion, checksum: await checksumJson(payload, checksum), payload };
}

function parseEnvelope(value: unknown): BackupEnvelope<JsonValue> {
  if (!isRecord(value) || value.format !== BACKUP_FORMAT) throw new BackupEnvelopeError("Unsupported backup format");
  assertPositiveVersion(value.schemaVersion);
  assertIsoDate(value.createdAt);
  if (typeof value.appVersion !== "string" || !value.appVersion) {
    throw new BackupEnvelopeError("Missing application version");
  }
  if (typeof value.checksum !== "string" || !value.checksum) throw new BackupEnvelopeError("Missing checksum");
  canonicalJson(value.payload);
  return value as unknown as BackupEnvelope<JsonValue>;
}

function assertPositiveVersion(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new BackupEnvelopeError("Invalid schema version");
}

function assertIsoDate(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value || Number.isNaN(Date.parse(value))) {
    throw new BackupEnvelopeError("Invalid creation timestamp");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

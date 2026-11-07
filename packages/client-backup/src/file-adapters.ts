import { type JsonValue } from "./canonical-json.js";
import { type CsvCodec } from "./csv.js";
import {
  decodeEnvelope,
  encodeEnvelope,
  type BackupEnvelope,
  type MigrationPort,
} from "./envelope.js";
import { type Checksum } from "./checksum.js";

export interface UserFileTransport {
  capabilities(): Promise<{ readonly available: boolean; readonly reason?: string }>;
  saveFile(fileName: string, mimeType: string, data: Uint8Array): Promise<void>;
  openFile(acceptedMimeTypes: readonly string[]): Promise<Uint8Array>;
}

export class JsonFileAdapter {
  constructor(private readonly transport: UserFileTransport) {}

  export(fileName: string, envelope: BackupEnvelope<JsonValue>): Promise<void> {
    return this.transport.saveFile(fileName, "application/json", encodeEnvelope(envelope));
  }

  async import(
    targetVersion: number,
    checksum: Checksum,
    migrations?: MigrationPort,
  ): Promise<BackupEnvelope<JsonValue>> {
    const data = await this.transport.openFile(["application/json", "text/json"]);
    return decodeEnvelope(data, targetVersion, checksum, migrations);
  }
}

export class StrictCsvFileAdapter<T extends Record<string, unknown>> {
  constructor(
    private readonly transport: UserFileTransport,
    private readonly codec: CsvCodec<T>,
  ) {}

  export(fileName: string, records: readonly T[]): Promise<void> {
    return this.transport.saveFile(
      fileName,
      "text/csv;charset=utf-8",
      new TextEncoder().encode(this.codec.encode(records)),
    );
  }

  async import(): Promise<T[]> {
    const data = await this.transport.openFile(["text/csv", "text/comma-separated-values"]);
    return this.codec.decode(new TextDecoder("utf-8", { fatal: true }).decode(data));
  }
}

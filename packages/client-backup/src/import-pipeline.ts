import { type JsonValue } from "./canonical-json.js";
import { type Checksum } from "./checksum.js";
import {
  decodeEnvelope,
  type BackupEnvelope,
  type MigrationPort,
} from "./envelope.js";
import {
  type MergeMode,
  type MergePort,
  type MergePreview,
  type MergeResult,
} from "./merge.js";

export interface PreparedImport<T> {
  readonly envelope: BackupEnvelope<JsonValue>;
  readonly incoming: readonly T[];
  readonly preview: MergePreview;
  readonly mode: MergeMode;
}

export interface ImportStore<T> {
  readAll(): Promise<readonly T[]>;
  /** Replace all records in one durable transaction. */
  commitAll(records: readonly T[]): Promise<void>;
}

export interface ImportPipelineOptions<T> {
  readonly targetVersion: number;
  readonly checksum: Checksum;
  readonly migrations: MigrationPort;
  readonly parsePayload: (payload: JsonValue) => readonly T[];
  readonly merger: MergePort<T>;
  readonly store: ImportStore<T>;
}

/**
 * Explicit two-step restore flow. prepare() performs parse -> checksum verify ->
 * migrate -> preview. commit() is the only mutation point.
 */
export class BackupImportPipeline<T> {
  constructor(private readonly options: ImportPipelineOptions<T>) {}

  async prepare(data: Uint8Array, mode: MergeMode): Promise<PreparedImport<T>> {
    const envelope = await decodeEnvelope(
      data,
      this.options.targetVersion,
      this.options.checksum,
      this.options.migrations,
    );
    const incoming = this.options.parsePayload(envelope.payload);
    const local = await this.options.store.readAll();
    return {
      envelope,
      incoming,
      preview: this.options.merger.preview(local, incoming, mode),
      mode,
    };
  }

  async commit(prepared: PreparedImport<T>): Promise<MergeResult<T>> {
    const local = await this.options.store.readAll();
    const result = this.options.merger.merge(local, prepared.incoming, prepared.mode);
    await this.options.store.commitAll(result.records);
    return result;
  }
}

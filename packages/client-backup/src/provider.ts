export interface BackupCapabilities {
  readonly available: boolean;
  readonly reason?: string;
}

export interface BackupMetadata {
  readonly createdAt: string;
  readonly schemaVersion: number;
  readonly byteLength: number;
  readonly [key: string]: string | number | boolean | undefined;
}

export interface BackupDescriptor {
  readonly id: string;
  readonly metadata: BackupMetadata;
}

export interface BackupReceipt extends BackupDescriptor {}

export interface BackupProvider {
  readonly id: string;
  capabilities(): Promise<BackupCapabilities>;
  save(snapshot: Uint8Array, metadata: BackupMetadata): Promise<BackupReceipt>;
  latest(): Promise<BackupDescriptor | null>;
  load(id: string): Promise<Uint8Array>;
}

export class BackupUnavailableError extends Error {
  constructor(readonly providerId: string, readonly reason: string) {
    super(`${providerId} is unavailable: ${reason}`);
  }
}

export class BackupNotFoundError extends Error {}

export class MemoryBackupProvider implements BackupProvider {
  private readonly entries = new Map<string, { data: Uint8Array; descriptor: BackupDescriptor }>();
  private sequence = 0;

  constructor(readonly id = "memory") {}

  async capabilities(): Promise<BackupCapabilities> {
    return { available: true };
  }

  async save(snapshot: Uint8Array, metadata: BackupMetadata): Promise<BackupReceipt> {
    const id = `${this.id}-${++this.sequence}`;
    const descriptor = { id, metadata: { ...metadata } };
    this.entries.set(id, { data: snapshot.slice(), descriptor });
    return descriptor;
  }

  async latest(): Promise<BackupDescriptor | null> {
    const entry = [...this.entries.values()].at(-1);
    return entry ? { id: entry.descriptor.id, metadata: { ...entry.descriptor.metadata } } : null;
  }

  async load(id: string): Promise<Uint8Array> {
    const entry = this.entries.get(id);
    if (!entry) throw new BackupNotFoundError(`Backup not found: ${id}`);
    return entry.data.slice();
  }
}

export class UnavailableBackupProvider implements BackupProvider {
  constructor(readonly id: string, private readonly reason: string) {}

  async capabilities(): Promise<BackupCapabilities> {
    return { available: false, reason: this.reason };
  }

  async save(_snapshot: Uint8Array, _metadata: BackupMetadata): Promise<BackupReceipt> {
    throw this.error();
  }

  async latest(): Promise<BackupDescriptor | null> {
    throw this.error();
  }

  async load(_id: string): Promise<Uint8Array> {
    throw this.error();
  }

  private error(): BackupUnavailableError {
    return new BackupUnavailableError(this.id, this.reason);
  }
}

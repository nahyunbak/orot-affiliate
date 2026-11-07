import {
  BackupNotFoundError,
  BackupUnavailableError,
  type BackupCapabilities,
  type BackupDescriptor,
  type BackupMetadata,
  type BackupProvider,
  type BackupReceipt,
} from "./provider.js";

export interface GoogleDriveAppDataTransport {
  capabilities(): Promise<BackupCapabilities>;
  uploadAppData(
    fileName: string,
    snapshot: Uint8Array,
    metadata: BackupMetadata,
  ): Promise<BackupDescriptor>;
  listAppData(fileName: string): Promise<readonly BackupDescriptor[]>;
  downloadAppData(id: string): Promise<Uint8Array>;
}

/**
 * Google Drive provider limited to the hidden appDataFolder space. OAuth and
 * token refresh stay in the injected transport; this package never handles a
 * client secret or calls an application backend.
 */
export class GoogleDriveAppDataProvider implements BackupProvider {
  readonly id = "google-drive-app-data";

  constructor(
    private readonly transport: GoogleDriveAppDataTransport,
    private readonly fileName = "client-backup.json",
  ) {}

  capabilities(): Promise<BackupCapabilities> {
    return this.transport.capabilities();
  }

  async save(snapshot: Uint8Array, metadata: BackupMetadata): Promise<BackupReceipt> {
    await assertAvailable(this.id, this.transport);
    return this.transport.uploadAppData(this.fileName, snapshot.slice(), metadata);
  }

  async latest(): Promise<BackupDescriptor | null> {
    await assertAvailable(this.id, this.transport);
    const entries = await this.transport.listAppData(this.fileName);
    return [...entries].sort((left, right) =>
      right.metadata.createdAt.localeCompare(left.metadata.createdAt),
    )[0] ?? null;
  }

  async load(id: string): Promise<Uint8Array> {
    await assertAvailable(this.id, this.transport);
    if (!id) throw new BackupNotFoundError("Google Drive backup ID is required");
    return (await this.transport.downloadAppData(id)).slice();
  }
}

export interface ICloudNativeTransport {
  capabilities(): Promise<BackupCapabilities>;
  writeAtomic(
    fileName: string,
    snapshot: Uint8Array,
    metadata: BackupMetadata,
  ): Promise<BackupDescriptor>;
  list(fileName: string): Promise<readonly BackupDescriptor[]>;
  read(id: string): Promise<Uint8Array>;
}

/** iCloud ubiquity-container provider. Entitlements and native I/O are injected. */
export class ICloudBackupProvider implements BackupProvider {
  readonly id = "icloud-private-container";

  constructor(
    private readonly transport: ICloudNativeTransport,
    private readonly fileName = "client-backup.json",
  ) {}

  capabilities(): Promise<BackupCapabilities> {
    return this.transport.capabilities();
  }

  async save(snapshot: Uint8Array, metadata: BackupMetadata): Promise<BackupReceipt> {
    await assertAvailable(this.id, this.transport);
    return this.transport.writeAtomic(this.fileName, snapshot.slice(), metadata);
  }

  async latest(): Promise<BackupDescriptor | null> {
    await assertAvailable(this.id, this.transport);
    const entries = await this.transport.list(this.fileName);
    return [...entries].sort((left, right) =>
      right.metadata.createdAt.localeCompare(left.metadata.createdAt),
    )[0] ?? null;
  }

  async load(id: string): Promise<Uint8Array> {
    await assertAvailable(this.id, this.transport);
    if (!id) throw new BackupNotFoundError("iCloud backup ID is required");
    return (await this.transport.read(id)).slice();
  }
}

async function assertAvailable(
  providerId: string,
  transport: { capabilities(): Promise<BackupCapabilities> },
): Promise<void> {
  const capability = await transport.capabilities();
  if (!capability.available) {
    throw new BackupUnavailableError(
      providerId,
      capability.reason ?? "provider is not configured on this device",
    );
  }
}

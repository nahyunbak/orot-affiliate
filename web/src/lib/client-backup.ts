import {
  BackupUnavailableError,
  GoogleDriveAppDataProvider,
  ICloudBackupProvider,
  UnavailableBackupProvider,
  type GoogleDriveAppDataTransport,
  type ICloudNativeTransport,
  type UserFileTransport,
} from "@full-template/client-backup";

/** Browser file picker/download adapter. Call openFile from a user gesture. */
export function createBrowserFileTransport(): UserFileTransport {
  return {
    async capabilities() {
      return typeof document === "undefined"
        ? { available: false, reason: "Browser file APIs are unavailable" }
        : { available: true };
    },
    async saveFile(fileName, mimeType, data) {
      if (typeof document === "undefined") {
        throw new BackupUnavailableError("file", "Browser file APIs are unavailable");
      }
      const blob = new Blob([new Uint8Array(data)], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    async openFile(acceptedMimeTypes) {
      if (typeof document === "undefined") {
        throw new BackupUnavailableError("file", "Browser file APIs are unavailable");
      }
      return new Promise<Uint8Array>((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = acceptedMimeTypes.join(",");
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) {
            reject(new Error("No file was selected"));
            return;
          }
          resolve(new Uint8Array(await file.arrayBuffer()));
        };
        input.click();
      });
    },
  };
}

export function createWebCloudProviders(options: {
  googleDrive?: GoogleDriveAppDataTransport;
  iCloudNative?: ICloudNativeTransport;
}) {
  return {
    googleDrive: options.googleDrive
      ? new GoogleDriveAppDataProvider(options.googleDrive)
      : new UnavailableBackupProvider(
          "google-drive-app-data",
          "Inject an OAuth transport configured for Drive appDataFolder",
        ),
    iCloud: options.iCloudNative
      ? new ICloudBackupProvider(options.iCloudNative)
      : new UnavailableBackupProvider(
          "icloud-private-container",
          "iCloud backup requires an Apple native ubiquity-container bridge",
        ),
  };
}

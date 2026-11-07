# Client-only backup

An app-agnostic TypeScript package for local-first JSON/CSV export and optional
user-owned cloud backup. It has no runtime dependencies, application backend,
embedded OAuth client secret, or provider SDK.

## Restore safety

Use `BackupImportPipeline.prepare()` first. It performs this fixed sequence:

1. Parse the versioned JSON envelope.
2. Verify its canonical JSON checksum.
3. Apply explicit, ordered schema migrations.
4. Parse the application payload and produce a merge/replace preview.
5. Call `commit()` only after the user confirms; the store commits all records
   atomically.

CSV is intentionally schema-driven. Define every header and parser with
`CsvCodec`; unknown, reordered, or missing columns fail closed. Exported values
that resemble spreadsheet formulas are escaped.

## Transports

- `JsonFileAdapter` and `StrictCsvFileAdapter` accept an injected file picker /
  saver. Generated web code contains a browser adapter; generated mobile code
  exposes a bridge boundary for Expo or native file modules.
- `GoogleDriveAppDataProvider` accepts an injected OAuth transport restricted to
  Drive `appDataFolder`. The host app owns OAuth consent, token storage, refresh,
  and revocation. Do not ship a client secret or broad Drive scope.
- `ICloudBackupProvider` accepts an injected Apple native transport that must use
  the app's private ubiquity container and atomic replacement. The host app owns
  entitlements and account-state observation.

Every transport reports `{ available, reason }`. Keep unavailable actions visible
but disabled with that reason; never imply a cloud backup succeeded before a
provider returns a receipt.

Backups belong to the currently signed-in Google/Apple account and do not sync
between providers. Signing out, changing accounts, revoking consent, platform
limitations, quota, or connectivity can make a provider unavailable. File export
is the portable fallback.

## Setup

```bash
pnpm --dir packages/client-backup install
pnpm --dir packages/client-backup test
```

The package stores plain JSON bytes. Provider transport encryption and at-rest
protection still apply, but application-level password encryption is not included.
Avoid exporting secrets and disclose the selected provider in the privacy policy.

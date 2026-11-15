# src/scripts/

## Responsibility
Operator/maintenance CLIs compiled into `dist/scripts`: environment validation, data integrity checking, storage reporting, and backup/restore of the Data repo.

## Design
- **Top-level side-effect scripts** (except `envValidation.ts`): each reads `process.argv[2]` as the data root (default `../Data`) or backup root, performs its check, logs a JSON report, and exits via `process.exitCode`. They are invoked by `package.json` scripts, not imported by the server.
- **Read-only audits** (`integrityCheck`, `storageReport`) vs **copy-based backup** (`backupSnapshot`).
- `envValidation.ts` is importable and also runnable, exposing `validateEnv()` for programmatic use.

## Flow
- `npm run check-env` → `dist/scripts/envValidation.js#printEnvStatus()`.
- `npm run integrity [root]` → walks required dirs (`snapshots`, `aggregates`, `analytics`, `state`), JSON-parses every file, reports corrupt counts/size.
- `npm run storage-report [root]` → counts files, sizes, dataset counts, oldest/newest timestamps, largest files.
- `npm run backup [dataRoot] [backupRoot]` → copies the data tree into a timestamped `backup-<ts>` directory.
- `npm run config-snapshot` → dumps effective config into the Data repo for audit.

## Files
- `envValidation.ts` — `EnvCheck`, `validateEnv`, `printEnvStatus`.
- `integrityCheck.ts` — integrity walk (required dirs, JSON parse failures, size summary).
- `storageReport.ts` — storage monitor report (`MonitorReport`).
- `backupSnapshot.ts` — timestamped copy of the data root.
- `configSnapshot.ts` — writes a config snapshot for auditability.

## Integration
- Invoked by: `package.json` `integrity`, `storage-report`, `backup`, `config-snapshot`, `check-env` scripts.
- Operates on the same on-disk layout produced by `src/jobs/*` and `src/storage/dataRepoWriter.ts`.

# src/storage/

## Responsibility
Writes snapshots into the external Data repository. This is the only place that talks to the GitHub Contents API for persistence, making the Data repo the system's database.

## Design
- **`IDataRepoWriter` interface** with a single `DataRepoWriter` implementation → swappable persistence strategy.
- **GitHub Contents API as storage**: `writeFileViaContentsApi` GETs the file SHA (if any), then PUTs base64 content; `updateIndex` maintains a per-directory `index.json` with `latest` plus the 100 most recent filenames.
- **Singleton accessor** `getDataRepoWriter(config)` / `resetDataRepoWriter()`, reset by `reloadConfig()`.
- **`githubFetch`** wraps global `fetch` with a 30 s `AbortController` timeout; failures surface as `StorageError`.
- `commitAndPush` is intentionally a no-op — the Contents API already commits each file.

## Flow
1. Caller builds `SnapshotPayload { timestamp, snapshotType, data }`.
2. `writeSnapshot(payload, subDir)` derives `<subDir>/<type>-<timestamp>.json`, writes via Contents API, then rewrites `<subDir>/index.json` (`latest` first, `files` capped at 100).
3. Readers (`src/api/routes/publicData.ts`, `src/jobs/intelligenceUtils.ts`) resolve `<dataRoot>/<subDir>/index.json` → latest filename.

## Files
- `dataRepoWriter.ts` — `SnapshotPayload`, `DataRepoConfig`, `IDataRepoWriter`, `githubFetch`, `DataRepoWriter`, `getDataRepoWriter`, `resetDataRepoWriter`.

## Integration
- Consumers: `src/jobs/publicExportPipeline.ts`, `src/jobs/scheduler.ts`, job pipelines that persist snapshots.
- Depends on: `src/api/connectAuth.ts` (token), `src/errors` (`StorageError`), `src/logging`, `src/config`.

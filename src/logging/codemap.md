# src/logging/

## Responsibility
Minimal leveled logger for CLI and serverless output.

## Design
- **Single mutable log level** (`LogLevel = debug|info|warn|error`) set once at boot from `cfg.logging.level` via `setLogLevel`.
- **Exported singleton object** `logger` with `debug/info/warn/error` methods; messages are plain text plus optional metadata. No transports, rotation or structured schema — Vercel captures stdout.

## Flow
- `src/index.ts` calls `setLogLevel(cfg.logging.level)` immediately after `loadConfig()`, so every later module importing `logger` shares the configured threshold.

## Files
- `logger.ts` — `setLogLevel`, `logger` singleton.

## Integration
- Consumers: all modules (`src/index.ts`, `src/jobs/*`, `src/api/*`, `src/storage/*`, `src/health/*`).
- Reads level from `src/config`.

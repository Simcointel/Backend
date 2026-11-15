# src/errors/

## Responsibility
Typed error taxonomy so callers can distinguish API, configuration and storage failures instead of matching message strings.

## Design
- **Inheritance hierarchy**: `SimcoIntelError extends Error` (base), then `ApiError`, `ConfigError`, `StorageError`. Each carries an HTTP `statusCode` for the API layer and sets `name` for log readability.

## Flow
- Thrown at the boundary that fails (e.g. `DataRepoWriter` throws `StorageError` on a non-OK GitHub Contents API response) and caught by job-level try/catch or the API's terminal error handler, which converts it into a `sendError(500, …)` envelope.

## Files
- `errors.ts` — `SimcoIntelError`, `ApiError`, `ConfigError`, `StorageError`.

## Integration
- Consumers: `src/storage/dataRepoWriter.ts`, API handlers, job pipelines.
- No dependencies on other project modules (leaf module).

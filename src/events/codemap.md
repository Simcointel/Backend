# src/events/

## Responsibility
Process-local publish/subscribe bus used to observe scheduler and pipeline lifecycle without coupling jobs to consumers.

## Design
- **Observer pattern with a typed event union.** `EventType` is a string-literal union (`scheduler:cycle-start`, `scheduler:cycle-end`, `fetch:complete`, …); `EventHandler` receives a `BusEvent { type, data, realm?, ts }`.
- **In-memory only** — listeners survive for the process lifetime; `removeAllListeners()` and `getListenerCount()` exist for tests/shutdown.

## Flow
1. Emitter calls `emit(type, data, realm?)`.
2. Bus stamps the event and invokes every registered handler, isolating handler exceptions so one bad listener cannot break a cycle.
3. Scheduler emits cycle boundaries and fetch results; jobs may emit domain events.

## Files
- `eventBus.ts` — `on`, `off`, `emit`, `removeAllListeners`, `getListenerCount`.
- `eventTypes.ts` — `EventType`, `BusEvent`, `EventHandler`.

## Integration
- Consumers: `src/jobs/scheduler.ts` (emits), future listeners/metrics.
- No project dependencies beyond its own types.

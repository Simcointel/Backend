# api/

## Responsibility
Vercel serverless entrypoint. A single file that instantiates the Express app and exports it as the default handler for every rewritten route.

## Design
- **Adapter only.** `createApp()` from `src/api/server.ts` builds the app; this file exports it as `default`, which Vercel turns into a serverless function.
- All routing (`/api/*`, `/admin/*`, catch-all) is handled inside the app, not by Vercel config — `vercel.json` rewrites every path to `api/index.ts`.

## Flow
Vercel request → `api/index.ts` → `createApp()` (cached at module scope) → Express middleware → custom `Router.match()` → route handler.

## Files
- `index.ts` — `export default app`. Three lines; no logic of its own.

## Integration
- Depends on: `src/api/server.ts`.
- Configured by: `vercel.json` (`functions["api/index.ts"].maxDuration = 300`, catch-all rewrites).

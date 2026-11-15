# src/api/

## Responsibility
HTTP surface of the backend: a hand-rolled path router mounted inside an Express app, plus shared middleware (JSON/error envelopes, rate limiting, versioned contract helpers) and the upstream Sim Companies API client.

## Design
- **Custom `Router` class** (`router.ts`): flat method+pattern table, `:param` path segments, `match()` returns `{ handler, params, action }`. It is *not* Express routing — Express only parses bodies, applies CORS and static admin files, then delegates to `router.match`.
- **Route modules as handlers**, not routers: every file in `routes/` exports plain `handleX(req, res, params, body, query)` functions. `server.ts#buildRouter()` wires them.
- **Uniform envelopes** (`middleware.ts`): `sendJson`, `sendSuccess(data, meta)`, `sendError(status, error)`. `contract.ts` adds `apiVersion()`, `sendVersionedSuccess/Error`, and `getSchema()`.
- **Rate limiting** (`rateLimiter.ts`): in-process windowed limiter keyed by `getClientIp`, applied to `/api/public/*` via `wrapRateLimited`.
- **Static admin hosting**: `createApp()` serves `admin/public` under `/admin` with MIME mapping, SPA fallback, and `VERCEL_URL` injected into `<meta name="api-base-url">`.
- **No scheduler autostart**: serverless deployments drive cycles through `/api/cron/cycle`; local runs use `npm start -- scheduler`.

## Flow
1. `api/index.ts` (Vercel entry) or `startServer(port)` (local) → `createApp()`.
2. `ensureDataDir()` resolves `DATA_REPO_PATH` (default `/tmp/data-repo`), creates it, calls `reloadConfig()`.
3. Express: `express.json({limit:1mb})` → CORS on `/api/public`, `/api/cron`, `/api/health`, `/api/status` → admin static middleware → terminal catch-all middleware.
4. Catch-all: `requestLogger` → `router.match(method, url, getBaseUrl(req))` → 404 envelope or `await handler(req, res, params, req.body)`; handler exceptions become a 500 envelope.

## Files
- `server.ts` — `createApp()`, `startServer()`, route table, CORS, admin static serving.
- `router.ts` — `Router` class and `RouteHandler`/`RouteParams` types.
- `middleware.ts` — response envelopes, `parseJsonBody`, `requestLogger`.
- `contract.ts` — API version constant, versioned success/error senders, schema stub.
- `rateLimiter.ts` — `checkRateLimit`, `rateLimitMiddleware`, stats, `stopRateLimiter`.
- `connectAuth.ts` — GitHub token acquisition (Vercel Connect) with cache + `clearGithubTokenCache`.
- `simcoTools.ts` — `SimcoToolsClient` typed wrapper over the Sim Companies API (resources, buildings, VWAPs, prices, realm status/summaries, companies, government orders, candlesticks) and `checkApiHealth`.
- `urlHelper.ts` — `getBaseUrl(req)` used for URL resolution in the router.
- `routes/*.ts` — see `routes/codemap.md`.

## Integration
- Consumed by: `api/index.ts` (serverless export), `src/index.ts` (`server` command), `src/admin/index.ts` (actions share the same job functions).
- Depends on: `src/jobs/*` (job execution), `src/config`, `src/storage/dataRepoWriter.ts`, `src/health`, `src/jobs/relationalUtils.ts`.

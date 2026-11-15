# admin/

## Responsibility
The static admin dashboard (plain HTML/CSS/JS, no build step) served by the backend at `/admin`. It is the human control surface for the pipeline.

## Design
- **Vanilla single-page app**: `public/index.html` + `public/js/admin.js` (`AdminDashboard` class) + `public/css/admin.css`. No framework, no bundler.
- **Same-origin API access**: all calls go to `/api/*` on the hosting backend, so no CORS is needed for the admin UI. The server injects `<meta name="api-base-url">` from `VERCEL_URL` when serving `index.html`.
- **Hash-tab navigation** (`dashboard`, `actions`, `config`, `scheduler`, `health`, `snapshots`, `logs`), theme toggle, sidebar collapse, auto-refresh.

## Flow
1. `GET /admin` → server reads `public/index.html`, substitutes the API base meta tag, returns HTML.
2. `admin.js` constructs `AdminDashboard` → `init()` binds events, `setupTabs()`, `loadInitialData()`.
3. Tab switches call the corresponding loader: `loadDashboardData`, `loadActions`, `loadConfigSections`, `loadSchedulerStatus`, `loadHealth`, `loadSnapshots`, `loadLogs` — each via `api(endpoint)`.
4. Mutations post to `/api/actions/*`, `/api/config/*`, `/api/snapshots/*`.

## Files
- `public/` — see `public/codemap.md`.
- `public/js/` — see `public/js/codemap.md`.

## Integration
- Served by: `src/api/server.ts#serveStaticFiles` (tries `src/../../admin/public`, `dist/../admin/public`, `<cwd>/admin/public`).
- Copied into `dist` by `scripts/copy-admin-assets.ts`.
- Talks to: `src/api/routes/*` (`/api/health`, `/api/status`, `/api/config`, `/api/actions`, `/api/snapshots`, `/api/macro/*`).

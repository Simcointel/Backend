# admin/public/

## Responsibility
Document shell and styling for the admin SPA.

## Design
- **Static document + external assets**: `index.html` defines the layout (sidebar nav with SVG icons, tab panes for dashboard/actions/config/scheduler/health/snapshots/logs), loads `/admin/css/admin.css` and `/admin/js/admin.js` with absolute paths so it works under the `/admin` mount.
- **Server-templated meta**: `<meta name="api-base-url" content="">` is rewritten by `src/api/server.ts` with the deployment URL; the client script uses it to build absolute API calls when needed.
- **SPA fallback**: unknown `/admin/*` paths return `index.html`, letting hash routing work; asset paths are path-traversal guarded by the server.

## Flow
`GET /admin` → server injects meta → browser loads CSS/JS → `AdminDashboard` boots and fetches `/api/*`.

## Files
- `index.html` — app shell, `data-tab` nav items, per-tab panes, meta `api-base-url`.
- `css/admin.css` — design tokens, layout grid, components (cards, tables, toasts, charts containers).

## Integration
- Consumed by: `admin/public/js/admin.js` (expects the DOM ids/classes defined here).
- Served by: `src/api/server.ts`; copied to `dist/admin/public` at build.

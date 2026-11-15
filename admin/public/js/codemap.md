# admin/public/js/

## Responsibility
Client-side behaviour of the admin dashboard: the `AdminDashboard` class (≈660 lines) that owns state, API calls, tab rendering and lightweight canvas charts.

## Design
- **Single class controller** (`new AdminDashboard()`), no modules or framework.
- **`api(endpoint, options)` wrapper**: prefixes nothing (same-origin), sends JSON, unwraps `{ success, data }` / `{ error }` envelopes, throws on failure so callers use `try/catch`.
- **Tab loaders** are independent async methods; `switchTab` invokes them lazily and `startAutoRefresh` re-polls periodic data.
- **Hand-rolled charts**: `drawLineChart` and `drawDoughnutChart` render on `<canvas>` from `/api/status` + `/api/health` data (`renderCharts`).
- **Client-side log buffer**: `loadLogs`/`filterLogs`/`clearLogs` keep an in-memory list for the logs tab.

## Flow
`constructor` → `init()` → `applyTheme`, `bindEvents`, `setupTabs`, `loadInitialData` → per-tab loaders → `api()` → `/api/*` → render into the tab pane; mutations (`runAction`, `saveConfigSection`, `saveSchedulerConfig`, `controlScheduler`) re-load the affected tab and show a toast.

## Files
- `admin.js` — `AdminDashboard`: `api`, `loadDashboardData`, `renderCharts`, `drawLineChart`, `drawDoughnutChart`, `loadActions`, `runAction`, `loadConfigSections`, `saveConfigSection`, `loadSchedulerStatus`, `loadSchedulerConfig`, `saveSchedulerConfig`, `controlScheduler`, `loadHealth`, `loadSnapshots`, `downloadSnapshot`, `viewSnapshot`, `loadLogs`, `filterLogs`, `clearLogs`, `startAutoRefresh`, `formatUptime`, `formatTime`, `showToast`.

## Integration
- Endpoints used: `/api/status`, `/api/health`, `/api/config[/:section]`, `/api/actions/:action`, `/api/actions/scheduler/:cmd`, `/api/snapshots[/:realm[/:file]]`.
- Depends on DOM ids/classes from `admin/public/index.html` and styles from `admin/public/css/admin.css`.

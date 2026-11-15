# scripts/

## Responsibility
Build-time tooling. Currently one script: copying the static admin dashboard into the compiled output so `dist` is self-contained.

## Design
- **Post-build copy step** using `fs-extra.copySync`, run by `npm run build` after `tsc` (`tsc && node dist/scripts/copy-admin-assets.js`).
- Source: `admin/public` → destination: `dist/admin/public`. Missing source only warns (does not fail the build).

## Flow
`npm run build` → `tsc` emits `dist/` → `copy-admin-assets.ts` copies `admin/public` to `dist/admin/public` → `src/api/server.ts` resolves the admin directory from `dist` at runtime.

## Files
- `copy-admin-assets.ts` — `copySync(admin/public → dist/admin/public)`.

## Integration
- Invoked by: `package.json#build`.
- Feeds: `src/api/server.ts#serveStaticFiles` (admin UI at `/admin`).

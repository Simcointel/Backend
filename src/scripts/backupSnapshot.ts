import { writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "fs";
import { resolve } from "path";

const dataRoot = resolve(process.cwd(), process.argv[2] || "../Data");
const backupRoot = resolve(process.cwd(), process.argv[3] || "../Backups");

function backup(): { ok: boolean; backedUp: number; path: string; errors: string[] } {
  const result = { ok: true, backedUp: 0, path: "", errors: [] as string[] };
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = resolve(backupRoot, `backup-${ts}`);
  result.path = dest;

  try {
    mkdirSync(dest, { recursive: true });
  } catch (err) {
    result.errors.push(`Cannot create backup dir: ${err instanceof Error ? err.message : String(err)}`);
    result.ok = false;
    return result;
  }

  const criticalPaths = [
    resolve(dataRoot, "state"),
    resolve(dataRoot, "aggregates", "dashboard"),
    resolve(dataRoot, "aggregates", "system", "operational"),
  ];

  for (const src of criticalPaths) {
    if (!existsSync(src)) continue;
    const rel = src.replace(dataRoot, "");
    const targetDir = resolve(dest, rel.slice(1));
    try { mkdirSync(targetDir, { recursive: true }); } catch { /**/ }
    const entries = readdirSync(src);
    for (const entry of entries) {
      try {
        copyFileSync(resolve(src, entry), resolve(targetDir, entry));
        result.backedUp++;
      } catch (err) {
        result.errors.push(`Failed to backup ${entry}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const manifest = { timestamp: ts, backedUp: result.backedUp, errors: result.errors.length, sources: criticalPaths };
  writeFileSync(resolve(dest, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  result.ok = result.errors.length === 0;
  return result;
}

const result = backup();
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);

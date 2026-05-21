import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { resolve, join } from "path";

const dataRoot = resolve(process.cwd(), process.argv[2] || "../Data");

interface CheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  summary: { dirs: number; files: number; corrupt: number; sizeBytes: number };
}

function checkIntegrity(root: string): CheckResult {
  const result: CheckResult = { ok: true, errors: [], warnings: [], summary: { dirs: 0, files: 0, corrupt: 0, sizeBytes: 0 } };
  const requiredDirs = ["snapshots", "aggregates", "analytics", "state"];

  for (const dir of requiredDirs) {
    const full = resolve(root, dir);
    if (!existsSync(full)) {
      result.warnings.push(`Missing directory: ${dir}/`);
      continue;
    }
    result.summary.dirs++;
    walkDir(full, result);
  }

  if (result.errors.length > 0) result.ok = false;
  return result;
}

function walkDir(dir: string, result: CheckResult): void {
  let entries: string[];
  try { entries = readdirSync(dir); }
  catch { result.errors.push(`Cannot read directory: ${dir}`); return; }

  for (const entry of entries) {
    const full = join(dir, entry);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) { walkDir(full, result); continue; }
      if (!entry.endsWith(".json")) continue;

      result.summary.files++;
      result.summary.sizeBytes += stat.size;

      const content = readFileSync(full, "utf-8");
      JSON.parse(content);
    } catch (err) {
      if (err instanceof SyntaxError) {
        result.errors.push(`Corrupt JSON: ${full} — ${err.message}`);
        result.summary.corrupt++;
      } else {
        result.errors.push(`IO error: ${full} — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

function main(): void {
  const result = checkIntegrity(dataRoot);
  console.log(JSON.stringify({ ok: result.ok, ...result.summary, errors: result.errors.length, warnings: result.warnings.length }, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main();

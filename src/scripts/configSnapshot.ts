import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve } from "path";

const configRoot = resolve(process.cwd(), process.argv[2] || "config");

interface ConfigSnapshot {
  timestamp: string;
  files: { name: string; size: number; valid: boolean; mtime: string }[];
  totalSize: number;
  errors: string[];
}

function snapshot(): ConfigSnapshot {
  const result: ConfigSnapshot = { timestamp: new Date().toISOString(), files: [], totalSize: 0, errors: [] };

  if (!existsSync(configRoot)) {
    result.errors.push(`Config directory not found: ${configRoot}`);
    return result;
  }

  const entries = readdirSync(configRoot).filter((e) => e.endsWith(".json"));
  for (const entry of entries) {
    const full = resolve(configRoot, entry);
    try {
      const stat = statSync(full);
      const content = readFileSync(full, "utf-8");
      JSON.parse(content);
      result.files.push({ name: entry, size: stat.size, valid: true, mtime: stat.mtime.toISOString() });
      result.totalSize += stat.size;
    } catch (err) {
      if (existsSync(full)) {
        const stat = statSync(full);
        result.files.push({ name: entry, size: stat.size, valid: false, mtime: stat.mtime.toISOString() });
      }
      result.errors.push(`Invalid config: ${entry} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

const report = snapshot();
console.log(JSON.stringify(report, null, 2));
process.exit(report.errors.length > 0 ? 1 : 0);

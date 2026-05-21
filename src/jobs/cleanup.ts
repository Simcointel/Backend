import { readdirSync, unlinkSync, existsSync, statSync } from "fs";
import { resolve, join } from "path";
import { logger } from "../logging/logger.js";

export interface CleanupResult {
  ok: boolean;
  deletedCount: number;
  freedBytes: number;
  error?: string;
}

function parseSnapshotTimestamp(name: string): Date | null {
  const prefix = "market-snapshot-";
  if (!name.startsWith(prefix) || !name.endsWith(".json")) return null;
  const tsPart = name.slice(prefix.length, -".json".length);
  const iso = tsPart.replace(/-/g, ":").replace(/T(\d+):(\d+):(\d+)/, (_, h, m, s) => `T${h}:${m}:${s}`);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function retentionCleanup(dataRepoPath: string, retentionDays: number, dryRun = false): CleanupResult {
  const snapshotsDir = resolve(dataRepoPath, "snapshots", "market");

  if (!existsSync(snapshotsDir)) {
    logger.info("No snapshots directory found – skipping cleanup");
    return { ok: true, deletedCount: 0, freedBytes: 0 };
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let deletedCount = 0;
  let freedBytes = 0;

  const realmDirs = readdirSync(snapshotsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(snapshotsDir, d.name));

  for (const realmDir of realmDirs) {
    const files = readdirSync(realmDir);
    for (const file of files) {
      const ts = parseSnapshotTimestamp(file);
      if (!ts) continue;
      if (ts.getTime() >= cutoff) continue;

      const filePath = join(realmDir, file);
      if (dryRun) {
        logger.info(`[dry-run] Would delete ${file}`);
      } else {
        const st = statSync(filePath);
        unlinkSync(filePath);
        freedBytes += st.size;
        deletedCount++;
        logger.info(`Deleted old snapshot ${file}`);
      }
    }
  }

  if (deletedCount > 0 || dryRun) {
    const label = dryRun ? "would free" : "freed";
    logger.info(`Cleanup ${dryRun ? "dry-run" : "complete"}: ${deletedCount} files, ${label} ${(freedBytes / 1024).toFixed(1)} KB`);
  } else {
    logger.info("Cleanup: no stale snapshots to delete");
  }

  return { ok: true, deletedCount, freedBytes };
}



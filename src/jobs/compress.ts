import { readFileSync, readdirSync, unlinkSync, existsSync, mkdirSync, writeFileSync, statSync } from "fs";
import { resolve, join } from "path";
import { logger } from "../logging/logger.js";
import type { MarketSnapshot } from "./fetchJob.js";

export interface CompressResult {
  ok: boolean;
  archivedFiles: number;
  archivePath: string | null;
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

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function runCompression(dataRepoPath: string, realm: number, retentionDays: number, dryRun = false): CompressResult {
  const snapshotsDir = resolve(dataRepoPath, "snapshots", "market", `realm-${realm}`);
  const archiveDir = resolve(dataRepoPath, "archives", "market", `realm-${realm}`);

  if (!existsSync(snapshotsDir)) {
    logger.info(`No snapshots dir for realm ${realm} – skipping compression`);
    return { ok: true, archivedFiles: 0, archivePath: null, freedBytes: 0 };
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const files = readdirSync(snapshotsDir)
    .filter((f) => f.startsWith("market-snapshot-") && f.endsWith(".json"))
    .map((f) => ({ name: f, path: join(snapshotsDir, f), date: parseSnapshotTimestamp(f) }))
    .filter((f): f is typeof f & { date: Date } => f.date !== null)
    .filter((f) => f.date.getTime() < cutoff)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (files.length === 0) {
    logger.info(`No archivable snapshots for realm ${realm}`);
    return { ok: true, archivedFiles: 0, archivePath: null, freedBytes: 0 };
  }

  const periods = groupByPeriod(files);

  if (dryRun) {
    for (const [period, group] of periods) {
      logger.info(`[dry-run] Would archive ${group.length} snapshots for ${period}`);
    }
    return { ok: true, archivedFiles: files.length, archivePath: null, freedBytes: 0 };
  }

  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true });
  }

  let totalArchived = 0;
  let totalFreed = 0;

  for (const [period, group] of periods) {
    const snapshots: MarketSnapshot[] = [];
    for (const f of group) {
      try {
        const raw = readFileSync(f.path, "utf-8");
        snapshots.push(JSON.parse(raw) as MarketSnapshot);
      } catch (err) {
        logger.warn(`Skipping unreadable snapshot ${f.name}`);
        continue;
      }
    }

    const archive = {
      a: period,
      r: realm,
      c: snapshots.length,
      s: snapshots,
    };

    const archiveName = `market-archive-${period}.json`;
    const archivePath = join(archiveDir, archiveName);
    writeFileSync(archivePath, JSON.stringify(archive), "utf-8");

    for (const f of group) {
      const st = statSize(f.path);
      unlinkSync(f.path);
      totalFreed += st;
      totalArchived++;
    }

    const archiveSize = statSize(archivePath);
    logger.info(`Archived ${group.length} snapshots → ${archiveName} (${(archiveSize / 1024).toFixed(1)} KB)`);
  }

  logger.info(`Compression complete: ${totalArchived} files archived, ${(totalFreed / 1024).toFixed(1)} KB freed`);
  return { ok: true, archivedFiles: totalArchived, archivePath: archiveDir, freedBytes: totalFreed };
}

function groupByPeriod(files: Array<{ name: string; path: string; date: Date }>): Map<string, typeof files> {
  const map = new Map<string, typeof files>();
  for (const f of files) {
    const period = formatDate(f.date);
    const group = map.get(period) ?? [];
    group.push(f);
    map.set(period, group);
  }
  return map;
}

function statSize(filePath: string): number {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

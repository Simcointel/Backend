import { existsSync, readdirSync, statSync } from "fs";
import { resolve } from "path";

const dataRoot = resolve(process.cwd(), process.argv[2] || "../Data");

interface MonitorReport {
  timestamp: string;
  storage: { dirs: number; files: number; totalSizeBytes: number };
  snapshotCount: number;
  aggregateCount: number;
  analyticsCount: number;
  stateFiles: number;
  largestFiles: { path: string; bytes: number }[];
  dataAge: { oldest: string; newest: string };
}

function generateReport(root: string): MonitorReport {
  const report: MonitorReport = {
    timestamp: new Date().toISOString(),
    storage: { dirs: 0, files: 0, totalSizeBytes: 0 },
    snapshotCount: 0,
    aggregateCount: 0,
    analyticsCount: 0,
    stateFiles: 0,
    largestFiles: [],
    dataAge: { oldest: "", newest: "" },
  };

  let oldest = Infinity;
  let newest = 0;

  function walk(dir: string, depth = 0) {
    if (depth > 8) return;
    let entries: string[];
    try { entries = readdirSync(dir); }
    catch { return; }

    for (const entry of entries) {
      const full = resolve(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) { report.storage.dirs++; walk(full, depth + 1); continue; }
        if (!entry.endsWith(".json")) continue;

        report.storage.files++;
        report.storage.totalSizeBytes += stat.size;

        if (dir.includes("snapshots")) report.snapshotCount++;
        else if (dir.includes("aggregates")) report.aggregateCount++;
        else if (dir.includes("analytics")) report.analyticsCount++;
        else if (dir.includes("state")) report.stateFiles++;

        const mtime = stat.mtimeMs;
        if (mtime < oldest) { oldest = mtime; report.dataAge.oldest = stat.mtime.toISOString(); }
        if (mtime > newest) { newest = mtime; report.dataAge.newest = stat.mtime.toISOString(); }

        if (report.largestFiles.length < 10 || stat.size > report.largestFiles[report.largestFiles.length - 1]?.bytes) {
          report.largestFiles.push({ path: full.replace(root, ""), bytes: stat.size });
          report.largestFiles.sort((a, b) => b.bytes - a.bytes);
          if (report.largestFiles.length > 10) report.largestFiles.length = 10;
        }
      } catch { /**/ }
    }
  }

  walk(root);
  return report;
}

const report = generateReport(dataRoot);
console.log(JSON.stringify(report, null, 2));

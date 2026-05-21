import { getResolvedDataPath } from "../storage/repoSync.js";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { loadConfig } from "../config/index.js";

export interface IndexSnapshot {
  t: string;
  r: number;
  ix: Record<string, { v: number; n: number; rn: number }>;
}

export interface InflationReport {
  t: string;
  r: number;
  in: Record<string, { cv: number; pv: number; ch: number }>;
}

interface HistoryEntry {
  d: string;
  ac: number;
  cv: number;
  tb: number;
  bs: number;
  ph: string;
  cp: boolean;
}

interface HistoryFile {
  r: number;
  y: number;
  e: HistoryEntry[];
}

export function getDataRoot(): string {
  return resolve(getResolvedDataPath());
}

export function loadIndexHistory(realm: number, limit: number): IndexSnapshot[] {
  const dir = resolve(getDataRoot(), "aggregates", "indexes", `realm-${realm}`);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.startsWith("price-indexes-") && f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), "utf-8")) as IndexSnapshot;
      } catch {
        return null;
      }
    })
    .filter((s): s is IndexSnapshot => s !== null)
    .reverse();
}

export function loadInflationHistory(realm: number, limit: number): InflationReport[] {
  const dir = resolve(getDataRoot(), "aggregates", "inflation", `realm-${realm}`);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.startsWith("inflation-report-") && f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), "utf-8")) as InflationReport;
      } catch {
        return null;
      }
    })
    .filter((r): r is InflationReport => r !== null)
    .reverse();
}

export function loadRealmHistory(realm: number): HistoryEntry[] {
  const dir = resolve(getDataRoot(), "aggregates", "macro-history", `realm-${realm}`);
  if (!existsSync(dir)) return [];

  const archDir = resolve(getDataRoot(), "archives", "macro", `realm-${realm}`);

  const sources: string[] = [];
  if (existsSync(dir)) {
    sources.push(...readdirSync(dir).filter((f) => f.endsWith(".json")));
  }
  if (existsSync(archDir)) {
    sources.push(
      ...readdirSync(archDir)
        .filter((f) => f.startsWith("macro-history-") && f.endsWith(".json"))
        .map((f) => resolve(archDir, f)),
    );
  }

  const allEntries: HistoryEntry[] = [];
  for (const f of sources) {
    try {
      const hf = JSON.parse(readFileSync(join(dir, f), "utf-8")) as HistoryFile;
      allEntries.push(...hf.e);
    } catch {
      try {
        const hf = JSON.parse(readFileSync(f, "utf-8")) as HistoryFile;
        allEntries.push(...hf.e);
      } catch { /* skip unreadable */ }
    }
  }

  allEntries.sort((a, b) => a.d.localeCompare(b.d));
  return allEntries;
}

export function getCategoryNames(): Record<string, string> {
  const cfg = loadConfig();
  const names: Record<string, string> = {};
  for (const [key, cat] of Object.entries(cfg.macroIndexes.categories)) {
    names[key] = cat.name;
  }
  return names;
}

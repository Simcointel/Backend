import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve } from "path";
import { getDataRoot } from "../../jobs/intelligenceUtils.js";

export interface PublicDashboard {
  scores: { eh: number; ms: number; st: number; ip: number; sr: number };
  regime: { na: string; sc: number };
  alerts: number;
  sectors: number;
  generatedAt: string;
}

export interface PublicMacro {
  realm: string;
  latest: {
    companiesValue: number | null;
    activeCompanies: number | null;
    bondsSold: number | null;
    totalBuildings: number | null;
  };
  latestIndexes: { cpi: number; coreCpi: number; gdp: number } | null;
  latestInflation: { cpiRate: number; coreCpiRate: number; gdpGrowth: number } | null;
  generatedAt: string;
}

function indexDir(subDir: string): { latest: string | null } {
  const p = resolve(getDataRoot(), subDir, "index.json");
  if (!existsSync(p)) return { latest: null };
  try {
    const idx = JSON.parse(readFileSync(p, "utf-8"));
    return { latest: idx.latest ?? null };
  } catch { return { latest: null }; }
}

function readLatestFile(subDir: string): unknown | null {
  const { latest } = indexDir(subDir);
  if (!latest) return null;
  try {
    return JSON.parse(readFileSync(resolve(getDataRoot(), subDir, latest), "utf-8"));
  } catch { return null; }
}

function readAllFiles(subDir: string, limit: number): unknown[] {
  const { latest } = indexDir(subDir);
  if (!latest) return [];
  const p = resolve(getDataRoot(), subDir);
  try {
    const files = readdirSync(p).filter(f => f.endsWith(".json") && f !== "index.json").sort().reverse().slice(0, limit);
    return files.map(f => { try { return JSON.parse(readFileSync(resolve(p, f), "utf-8")); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function historyDir(realm: number): string {
  return `aggregates/realm-status/realm-${realm}`;
}

function indexDirPath(realm: number): string {
  return `aggregates/indexes/realm-${realm}`;
}

function inflationDirPath(realm: number): string {
  return `aggregates/inflation/realm-${realm}`;
}

function macroHistoryDir(realm: number): string {
  return resolve(getDataRoot(), "aggregates", "macro-history", `realm-${realm}`);
}

export function loadLatestMacroData(realm: number): PublicMacro {
  const result: PublicMacro = {
    realm: String(realm),
    latest: { companiesValue: null, activeCompanies: null, bondsSold: null, totalBuildings: null },
    latestIndexes: null,
    latestInflation: null,
    generatedAt: new Date().toISOString(),
  };

  const status = readLatestFile(historyDir(realm)) as Record<string, unknown> | null;
  if (status) {
    result.latest.companiesValue = (status.cv as number) ?? null;
    result.latest.activeCompanies = (status.ac as number) ?? null;
    result.latest.bondsSold = (status.bs as number) ?? null;
    result.latest.totalBuildings = (status.tb as number) ?? null;
  }

  const ix = readLatestFile(indexDirPath(realm)) as Record<string, unknown> | null;
  if (ix?.ix) {
    const data = ix.ix as Record<string, { v: number }>;
    result.latestIndexes = {
      cpi: data.cpi?.v ?? null,
      coreCpi: data["core-cpi"]?.v ?? null,
      gdp: data.gdp?.v ?? null,
    };
  }

  const inf = readLatestFile(inflationDirPath(realm)) as Record<string, unknown> | null;
  if (inf?.in) {
    const data = inf.in as Record<string, { ch: number }>;
    result.latestInflation = {
      cpiRate: data.cpi?.ch ?? null,
      coreCpiRate: data["core-cpi"]?.ch ?? null,
      gdpGrowth: data.gdp?.ch ?? null,
    };
  }

  return result;
}

export function loadMacroHistory(realm: number, limit = 120): { entries: unknown[]; total: number } {
  try {
    const dir = macroHistoryDir(realm);
    if (!existsSync(dir)) return { entries: [], total: 0 };
    const yearFiles = readdirSync(dir).filter(f => /^\d{4}\.json$/.test(f)).sort().reverse();
    const entries: Record<string, unknown>[] = [];
    for (const yf of yearFiles) {
      if (entries.length >= limit) break;
      try {
        const file = JSON.parse(readFileSync(resolve(dir, yf), "utf-8"));
        if (file.e) {
          for (const e of (file.e as Record<string, unknown>[]).slice().reverse()) {
            if (entries.length >= limit) break;
            entries.push(e);
          }
        }
      } catch { continue; }
    }
    return { entries, total: entries.length };
  } catch { return { entries: [], total: 0 }; }
}

export function loadMacroIndexes(realm: number, limit = 30): { indexes: unknown[]; total: number } {
  const indexes = readAllFiles(indexDirPath(realm), limit);
  return { indexes, total: indexes.length };
}

export function loadMacroInflation(realm: number, limit = 30): { inflation: unknown[]; total: number } {
  const inflation = readAllFiles(inflationDirPath(realm), limit);
  return { inflation, total: inflation.length };
}
import { getResolvedDataPath } from "../../storage/repoSync.js";
import { getBaseUrl } from "../urlHelper.js";
import { IncomingMessage, ServerResponse } from "http";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { sendSuccess, sendError } from "../middleware.js";
import { loadConfig } from "../../config/index.js";
import { loadState } from "../../jobs/macroHistory.js";

type HistoryEntry = { d: string; ac: number; cv: number; tb: number; bs: number; ph: string; cp: boolean };
type HistoryFile = { r: number; y: number; e: HistoryEntry[] };

function getDataRoot(): string {
  return resolve(getResolvedDataPath());
}

function parseRealmParam(raw: string): number | null {
  const n = parseInt(raw.replace("realm-", ""), 10);
  return isNaN(n) ? null : n;
}

function loadAllYears(realm: number): HistoryFile[] {
  const dir = resolve(getDataRoot(), "aggregates", "macro-history", `realm-${realm}`);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const year = parseInt(f.replace(".json", ""), 10);
      if (isNaN(year)) return null;
      try {
        return JSON.parse(readFileSync(join(dir, f), "utf-8")) as HistoryFile;
      } catch {
        return null;
      }
    })
    .filter((f): f is HistoryFile => f !== null)
    .sort((a, b) => a.y - b.y);
}

function loadArchivedYears(realm: number): HistoryFile[] {
  const dir = resolve(getDataRoot(), "archives", "macro", `realm-${realm}`);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith("macro-history-") && f.endsWith(".json"))
    .map((f) => {
      const year = parseInt(f.replace("macro-history-", "").replace(".json", ""), 10);
      if (isNaN(year)) return null;
      try {
        return JSON.parse(readFileSync(join(dir, f), "utf-8")) as HistoryFile;
      } catch {
        return null;
      }
    })
    .filter((f): f is HistoryFile => f !== null)
    .sort((a, b) => a.y - b.y);
}

function filterByDateRange(entries: HistoryEntry[], from?: string, to?: string): HistoryEntry[] {
  let filtered = entries;
  if (from) filtered = filtered.filter((e) => e.d >= from);
  if (to) filtered = filtered.filter((e) => e.d <= to);
  return filtered;
}

function limitEntries(entries: HistoryEntry[], limit?: string): HistoryEntry[] {
  if (!limit) return entries;
  const n = parseInt(limit, 10);
  if (isNaN(n) || n <= 0) return entries;
  const result: HistoryEntry[] = [];
  const step = Math.max(1, Math.floor(entries.length / n));
  for (let i = entries.length - 1; i >= 0; i -= step) {
    result.unshift(entries[i]);
  }
  if (!result.includes(entries[entries.length - 1])) {
    result.push(entries[entries.length - 1]);
  }
  if (!result.includes(entries[0])) {
    result.unshift(entries[0]);
  }
  return result;
}

export async function handleMacroHistory(req: IncomingMessage, res: ServerResponse, realm: string): Promise<void> {
  const r = parseRealmParam(realm);
  if (r === null) return sendError(res, 400, "Invalid realm");

  const url = new URL(req.url || "", getBaseUrl(req));
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const limit = url.searchParams.get("limit") || undefined;

  const activeYears = loadAllYears(r);
  const archivedYears = loadArchivedYears(r);
  const allYears = [...activeYears, ...archivedYears];

  let allEntries: HistoryEntry[] = [];
  for (const yf of allYears) {
    allEntries = allEntries.concat(yf.e);
  }

  allEntries = filterByDateRange(allEntries, from, to);
  allEntries = limitEntries(allEntries, limit);

  sendSuccess(res, {
    realm: r,
    totalEntries: allEntries.length,
    yearsAvailable: allYears.map((y) => y.y),
    history: allEntries,
  });
}

export async function handleMacroIndexes(req: IncomingMessage, res: ServerResponse, realm: string): Promise<void> {
  const r = parseRealmParam(realm);
  if (r === null) return sendError(res, 400, "Invalid realm");

  const dir = resolve(getDataRoot(), "aggregates", "indexes", `realm-${r}`);
  if (!existsSync(dir)) return sendSuccess(res, { realm: r, indexes: [] });

  const files = readdirSync(dir)
    .filter((f) => f.startsWith("price-indexes-") && f.endsWith(".json"))
    .sort()
    .reverse();

  const url = new URL(req.url || "", getBaseUrl(req));
  const limit = parseInt(url.searchParams.get("limit") || "100", 10);

  const selected = files.slice(0, Math.min(limit, files.length));
  const indexes = selected.map((f) => {
    try {
      return JSON.parse(readFileSync(join(dir, f), "utf-8"));
    } catch {
      return null;
    }
  }).filter(Boolean);

  sendSuccess(res, { realm: r, total: files.length, indexes });
}

export async function handleMacroInflation(req: IncomingMessage, res: ServerResponse, realm: string): Promise<void> {
  const r = parseRealmParam(realm);
  if (r === null) return sendError(res, 400, "Invalid realm");

  const dir = resolve(getDataRoot(), "aggregates", "inflation", `realm-${r}`);
  if (!existsSync(dir)) return sendSuccess(res, { realm: r, inflation: [] });

  const files = readdirSync(dir)
    .filter((f) => f.startsWith("inflation-report-") && f.endsWith(".json"))
    .sort()
    .reverse();

  const url = new URL(req.url || "", getBaseUrl(req));
  const limit = parseInt(url.searchParams.get("limit") || "100", 10);

  const selected = files.slice(0, Math.min(limit, files.length));
  const inflation = selected.map((f) => {
    try {
      return JSON.parse(readFileSync(join(dir, f), "utf-8"));
    } catch {
      return null;
    }
  }).filter(Boolean);

  sendSuccess(res, { realm: r, total: files.length, inflation });
}

export async function handleMacroPhases(req: IncomingMessage, res: ServerResponse, realm: string): Promise<void> {
  const r = parseRealmParam(realm);
  if (r === null) return sendError(res, 400, "Invalid realm");

  const allYears = loadAllYears(r);
  const archivedYears = loadArchivedYears(r);
  const allYearsFiles = [...allYears, ...archivedYears];

  const phases: Array<{ date: string; phase: string }> = [];
  const seen = new Set<string>();

  for (const yf of allYearsFiles) {
    for (const e of yf.e) {
      if (seen.has(e.d)) continue;
      seen.add(e.d);
      if (e.ph && e.ph !== "") {
        phases.push({ date: e.d, phase: e.ph });
      }
    }
  }

  phases.sort((a, b) => a.date.localeCompare(b.date));

  const transitions: Array<{ from: string; to: string; date: string }> = [];
  for (let i = 1; i < phases.length; i++) {
    if (phases[i].phase !== phases[i - 1].phase) {
      transitions.push({ from: phases[i - 1].phase, to: phases[i].phase, date: phases[i].date });
    }
  }

  sendSuccess(res, {
    realm: r,
    totalDays: phases.length,
    currentPhase: phases.length > 0 ? phases[phases.length - 1].phase : null,
    transitions,
    phases,
  });
}

export async function handleMacroLatest(req: IncomingMessage, res: ServerResponse, realm: string): Promise<void> {
  const r = parseRealmParam(realm);
  if (r === null) return sendError(res, 400, "Invalid realm");

  const state = loadState(r);

  const allYears = loadAllYears(r);
  const archivedYears = loadArchivedYears(r);
  const allYearsFiles = [...allYears, ...archivedYears];

  let latestEntry: HistoryEntry | null = null;
  for (const yf of allYearsFiles) {
    if (yf.e.length > 0) {
      const last = yf.e[yf.e.length - 1];
      if (!latestEntry || last.d > latestEntry.d) {
        latestEntry = last;
      }
    }
  }

  const indexesDir = resolve(getDataRoot(), "aggregates", "indexes", `realm-${r}`);
  let latestIndexes: unknown = null;
  if (existsSync(indexesDir)) {
    const files = readdirSync(indexesDir)
      .filter((f) => f.startsWith("price-indexes-") && f.endsWith(".json"))
      .sort()
      .reverse();
    if (files.length > 0) {
      try {
        latestIndexes = JSON.parse(readFileSync(join(indexesDir, files[0]), "utf-8"));
      } catch { /* ignore */ }
    }
  }

  const inflationDir = resolve(getDataRoot(), "aggregates", "inflation", `realm-${r}`);
  let latestInflation: unknown = null;
  if (existsSync(inflationDir)) {
    const files = readdirSync(inflationDir)
      .filter((f) => f.startsWith("inflation-report-") && f.endsWith(".json"))
      .sort()
      .reverse();
    if (files.length > 0) {
      try {
        latestInflation = JSON.parse(readFileSync(join(inflationDir, files[0]), "utf-8"));
      } catch { /* ignore */ }
    }
  }

  sendSuccess(res, {
    realm: r,
    state: {
      backfillComplete: state.backfillComplete,
      totalDaysStored: state.totalDaysStored,
      oldestDateStored: state.oldestDateStored,
      newestDateStored: state.newestDateStored,
      lastSyncTime: state.lastSyncTime,
    },
    latestHistory: latestEntry,
    latestIndexes,
    latestInflation,
  });
}

export async function handleMacroState(req: IncomingMessage, res: ServerResponse, realm: string): Promise<void> {
  const r = parseRealmParam(realm);
  if (r === null) return sendError(res, 400, "Invalid realm");

  const state = loadState(r);
  sendSuccess(res, state);
}

export async function handleMacroListHistory(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const cfg = loadConfig();
  const result: Record<string, { years: number[]; totalEntries: number }> = {};

  for (const realm of cfg.simco.realms) {
    const allYears = loadAllYears(realm);
    const archivedYears = loadArchivedYears(realm);
    let total = 0;
    for (const yf of [...allYears, ...archivedYears]) {
      total += yf.e.length;
    }
    result[`realm-${realm}`] = {
      years: [...allYears, ...archivedYears].map((y) => y.y).sort(),
      totalEntries: total,
    };
  }

  sendSuccess(res, result);
}

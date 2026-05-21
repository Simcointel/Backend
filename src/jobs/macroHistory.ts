import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { SimcoToolsClient, type RealmSummaryEntry } from "../api/simcoTools.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface BackfillState {
  r: number;
  newestDateStored: string;
  oldestDateStored: string;
  lastSyncTime: string;
  backfillComplete: boolean;
  totalDaysStored: number;
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

export interface HistorySyncResult {
  ok: boolean;
  realm: number;
  newEntries: number;
  totalStored: number;
  backfillComplete: boolean;
  error?: string;
}

export interface MacroArchiveResult {
  ok: boolean;
  archivedYears: number;
  archivedFiles: number;
  freedBytes: number;
  error?: string;
}

function getDataRoot(): string {
  return resolve(loadConfig().dataRepo.path);
}

function statePath(realm: number): string {
  return resolve(getDataRoot(), "state", "backfill", `realm-${realm}.json`);
}

function historyDir(realm: number): string {
  return resolve(getDataRoot(), "aggregates", "macro-history", `realm-${realm}`);
}

function yearFilePath(realm: number, year: number): string {
  return resolve(historyDir(realm), `${year}.json`);
}

function archiveDir(realm: number): string {
  return resolve(getDataRoot(), "archives", "macro", `realm-${realm}`);
}

export function loadState(realm: number): BackfillState {
  const p = statePath(realm);
  if (!existsSync(p)) {
    return {
      r: realm,
      newestDateStored: "",
      oldestDateStored: "",
      lastSyncTime: "",
      backfillComplete: false,
      totalDaysStored: 0,
    };
  }
  return JSON.parse(readFileSync(p, "utf-8")) as BackfillState;
}

function saveState(state: BackfillState): void {
  const p = statePath(state.r);
  const dir = resolve(p, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

function loadYearFile(realm: number, year: number): HistoryFile | null {
  const p = yearFilePath(realm, year);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as HistoryFile;
}

function ensureDir(p: string): void {
  const dir = resolve(p, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function getYearSet(realm: number, year: number): Set<string> {
  const file = loadYearFile(realm, year);
  if (!file) return new Set();
  return new Set(file.e.map((e) => e.d));
}

function appendToYearFile(realm: number, year: number, entries: HistoryEntry[]): void {
  const existing = loadYearFile(realm, year);
  const merged = existing ? existing.e.slice() : [];

  for (const e of entries) {
    const idx = merged.findIndex((x) => x.d === e.d);
    if (idx >= 0) {
      merged[idx] = e;
    } else {
      merged.push(e);
    }
  }

  merged.sort((a, b) => a.d.localeCompare(b.d));

  const file: HistoryFile = { r: realm, y: year, e: merged };
  const p = yearFilePath(realm, year);
  ensureDir(p);
  writeFileSync(p, JSON.stringify(file) + "\n", "utf-8");
}

export async function runBackfill(realm: number): Promise<HistorySyncResult> {
  const cfg = loadConfig();
  const client = new SimcoToolsClient(realm);
  const state = loadState(realm);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cfg.macroHistory.backfillLookbackDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let newEntries = 0;
  let page = 1;
  let keepGoing = true;

  const yearSets = new Map<number, Set<string>>();
  function hasDate(dateStr: string): boolean {
    const year = parseInt(dateStr.slice(0, 4), 10);
    if (!yearSets.has(year)) {
      yearSets.set(year, getYearSet(realm, year));
    }
    return yearSets.get(year)!.has(dateStr);
  }

  while (keepGoing) {
    let response;
    try {
      response = await client.getRealmSummaries(page, cfg.macroHistory.historyPageSize);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[realm ${realm}] Backfill page ${page} failed: ${msg}`);
      return {
        ok: false, realm, newEntries, totalStored: state.totalDaysStored + newEntries,
        backfillComplete: state.backfillComplete, error: msg,
      };
    }

    if (!response.summaries || response.summaries.length === 0) break;

    const batch: HistoryEntry[] = [];

    for (const s of response.summaries) {
      const dateStr = s.date.slice(0, 10);

      if (dateStr < cutoffStr) {
        keepGoing = false;
        break;
      }

      if (hasDate(dateStr)) continue;

      const year = parseInt(dateStr.slice(0, 4), 10);
      const entry: HistoryEntry = {
        d: dateStr,
        ac: s.activeCompanies,
        cv: s.companiesValue,
        tb: s.totalBuildings,
        bs: s.bondsSold,
        ph: s.phase,
        cp: s.completed,
      };
      batch.push(entry);

      if (!yearSets.has(year)) yearSets.set(year, new Set());
      yearSets.get(year)!.add(dateStr);
      newEntries++;
    }

    if (batch.length > 0) {
      const byYear = new Map<number, HistoryEntry[]>();
      for (const e of batch) {
        const y = parseInt(e.d.slice(0, 4), 10);
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y)!.push(e);
      }
      for (const [year, entries] of byYear) {
        appendToYearFile(realm, year, entries);
      }

      const dates = batch.map((e) => e.d).sort();
      if (!state.oldestDateStored || dates[0] < state.oldestDateStored) {
        state.oldestDateStored = dates[0];
      }
      const lastNew = dates[dates.length - 1];
      if (!state.newestDateStored || lastNew > state.newestDateStored) {
        state.newestDateStored = lastNew;
      }
      state.totalDaysStored += batch.length;
    }

    state.lastSyncTime = new Date().toISOString();
    saveState(state);

    if (!keepGoing) break;
    if (page >= response.metadata.last_page) break;
    page++;
  }

  state.backfillComplete = true;
  state.lastSyncTime = new Date().toISOString();
  saveState(state);

  logger.info(`[realm ${realm}] Backfill complete: ${newEntries} new entries, total=${state.totalDaysStored}`);
  return {
    ok: true, realm, newEntries, totalStored: state.totalDaysStored,
    backfillComplete: true,
  };
}

export async function runHistorySync(realm: number): Promise<HistorySyncResult> {
  const cfg = loadConfig();
  const client = new SimcoToolsClient(realm);
  const state = loadState(realm);

  if (!state.backfillComplete) {
    return runBackfill(realm);
  }

  let newEntries = 0;

  try {
    const response = await client.getRealmSummaries(1, cfg.macroHistory.syncPageSize);

    if (!response.summaries || response.summaries.length === 0) {
      return { ok: true, realm, newEntries: 0, totalStored: state.totalDaysStored, backfillComplete: true };
    }

    for (const s of response.summaries) {
      const dateStr = s.date.slice(0, 10);
      const year = parseInt(dateStr.slice(0, 4), 10);
      const yearSet = getYearSet(realm, year);
      if (yearSet.has(dateStr)) continue;

      const entry: HistoryEntry = {
        d: dateStr,
        ac: s.activeCompanies,
        cv: s.companiesValue,
        tb: s.totalBuildings,
        bs: s.bondsSold,
        ph: s.phase,
        cp: s.completed,
      };
      appendToYearFile(realm, year, [entry]);
      newEntries++;

      if (!state.oldestDateStored || dateStr < state.oldestDateStored) {
        state.oldestDateStored = dateStr;
      }
      if (!state.newestDateStored || dateStr > state.newestDateStored) {
        state.newestDateStored = dateStr;
      }
    }

    state.totalDaysStored += newEntries;
    state.lastSyncTime = new Date().toISOString();
    saveState(state);

    logger.info(`[realm ${realm}] History sync: ${newEntries} new entries`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[realm ${realm}] History sync failed: ${msg}`);
    return { ok: false, realm, newEntries, totalStored: state.totalDaysStored, backfillComplete: state.backfillComplete, error: msg };
  }

  return { ok: true, realm, newEntries, totalStored: state.totalDaysStored, backfillComplete: true };
}

export async function runAllHistorySync(): Promise<{ ok: boolean; results: HistorySyncResult[] }> {
  const cfg = loadConfig();
  const results = await Promise.allSettled(
    cfg.simco.realms.map((r) => runHistorySync(r)),
  );

  const fulfilled: HistorySyncResult[] = [];
  let allOk = true;
  for (const r of results) {
    if (r.status === "fulfilled") {
      fulfilled.push(r.value);
      if (!r.value.ok) allOk = false;
    } else {
      allOk = false;
    }
  }
  return { ok: allOk, results: fulfilled };
}

export async function runAllBackfills(): Promise<{ ok: boolean; results: HistorySyncResult[] }> {
  const cfg = loadConfig();
  const results = await Promise.allSettled(
    cfg.simco.realms.map((r) => runBackfill(r)),
  );

  const fulfilled: HistorySyncResult[] = [];
  let allOk = true;
  for (const r of results) {
    if (r.status === "fulfilled") {
      fulfilled.push(r.value);
      if (!r.value.ok) allOk = false;
    } else {
      allOk = false;
    }
  }
  return { ok: allOk, results: fulfilled };
}

export function runMacroArchive(realm: number, dryRun = false): MacroArchiveResult {
  const cfg = loadConfig();
  const retentionYears = cfg.macroHistory.historyRetentionYears;
  const cutoffYear = new Date().getFullYear() - retentionYears;

  const histDir = historyDir(realm);
  if (!existsSync(histDir)) {
    return { ok: true, archivedYears: 0, archivedFiles: 0, freedBytes: 0 };
  }

  const files = readdirSync(histDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: f, year: parseInt(f.replace(".json", ""), 10) }))
    .filter((f) => !isNaN(f.year) && f.year <= cutoffYear);

  if (files.length === 0) {
    return { ok: true, archivedYears: 0, archivedFiles: 0, freedBytes: 0 };
  }

  const archDir = archiveDir(realm);
  let totalArchived = 0;
  let totalFreed = 0;

  for (const f of files) {
    const srcPath = join(histDir, f.name);
    if (dryRun) {
      logger.info(`[dry-run] Would archive ${f.name} for realm ${realm}`);
      totalArchived++;
      continue;
    }

    if (!existsSync(archDir)) mkdirSync(archDir, { recursive: true });
    const destPath = join(archDir, `macro-history-${f.year}.json`);

    const content = readFileSync(srcPath, "utf-8");
    writeFileSync(destPath, content, "utf-8");
    const freed = content.length;
    unlinkSync(srcPath);
    totalFreed += freed;
    totalArchived++;

    logger.info(`Archived ${f.name} → archives/macro/realm-${realm}/macro-history-${f.year}.json (${(freed / 1024).toFixed(1)} KB)`);
  }

  logger.info(`Macro archive complete: ${totalArchived} year files archived, ${(totalFreed / 1024).toFixed(1)} KB freed`);
  return { ok: true, archivedYears: totalArchived, archivedFiles: totalArchived, freedBytes: totalFreed };
}

export function runAllMacroArchives(dryRun = false): MacroArchiveResult {
  const cfg = loadConfig();
  let totalArchived = 0;
  let totalFreed = 0;

  for (const realm of cfg.simco.realms) {
    const result = runMacroArchive(realm, dryRun);
    totalArchived += result.archivedFiles;
    totalFreed += result.freedBytes;
  }

  return { ok: true, archivedYears: totalArchived, archivedFiles: totalArchived, freedBytes: totalFreed };
}

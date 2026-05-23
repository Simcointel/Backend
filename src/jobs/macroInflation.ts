import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { DataRepoWriter } from "../storage/dataRepoWriter.js";
import type { IndexReport } from "./priceIndex.js";

export interface InflationEntry {
  period: string;
  category: string;
  categoryName: string;
  currentValue: number;
  previousValue: number;
  changePct: number;
}

export interface InflationReport {
  t: string;
  r: number;
  lb: number;
  in: Record<string, { cv: number; pv: number; ch: number }>;
}

function findIndexFiles(dataRepoPath: string, realm: number, limit: number): string[] {
  const dir = resolve(dataRepoPath, "aggregates", "indexes", `realm-${realm}`);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.startsWith("price-indexes-") && f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => join(dir, f));
}

export async function runInflationTracking(realm: number): Promise<{ ok: boolean; report: InflationReport["in"] | null; error?: string }> {
  const cfg = loadConfig();
  const lookback = cfg.macroSettings.inflationLookbackDays;
  const categories = cfg.macroIndexes.categories;

  if (!categories || Object.keys(categories).length === 0) {
    return { ok: false, report: null, error: "no categories defined" };
  }

  const indexFiles = findIndexFiles(cfg.dataRepo.path, realm, lookback);
  if (indexFiles.length < 2) {
    return { ok: false, report: null, error: `need at least 2 index snapshots, found ${indexFiles.length}` };
  }

  const reports: IndexReport[] = [];
  for (const f of indexFiles) {
    try {
      reports.push(JSON.parse(readFileSync(f, "utf-8")) as IndexReport);
    } catch {
      continue;
    }
  }

  if (reports.length < 2) {
    return { ok: false, report: null, error: "need at least 2 readable index reports" };
  }

  const latest = reports[0];
  const oldest = reports[reports.length - 1];

  const inflation: InflationReport["in"] = {};

  for (const [key, cat] of Object.entries(categories)) {
    const cur = latest.ix[key];
    const prev = oldest.ix[key];
    if (!cur || !prev || prev.v === 0) continue;

    const changePct = Math.round(((cur.v - prev.v) / prev.v) * 10000) / 100;
    inflation[key] = {
      cv: cur.v,
      pv: prev.v,
      ch: changePct,
    };
  }

  const cpiCur = latest.ix?.["cpi"];
  const cpiPrev = oldest.ix?.["cpi"];
  if (cpiCur && cpiPrev && cpiPrev.v > 0) {
    inflation["cpi"] = {
      cv: cpiCur.v, pv: cpiPrev.v,
      ch: Math.round(((cpiCur.v - cpiPrev.v) / cpiPrev.v) * 10000) / 100,
    };
  }
  const coreCur = latest.ix?.["core-cpi"];
  const corePrev = oldest.ix?.["core-cpi"];
  if (coreCur && corePrev && corePrev.v > 0) {
    inflation["core-cpi"] = {
      cv: coreCur.v, pv: corePrev.v,
      ch: Math.round(((coreCur.v - corePrev.v) / corePrev.v) * 10000) / 100,
    };
  }

  const gdpCur = latest.ix?.["gdp"];
  const gdpPrev = oldest.ix?.["gdp"];
  if (gdpCur && gdpPrev && gdpPrev.v > 0) {
    inflation["gdp"] = {
      cv: gdpCur.v, pv: gdpPrev.v,
      ch: Math.round(((gdpCur.v - gdpPrev.v) / gdpPrev.v) * 10000) / 100,
    };
  }

  if (Object.keys(inflation).length === 0) {
    return { ok: false, report: null, error: "no inflation data computed" };
  }

  const report: InflationReport = {
    t: new Date().toISOString(),
    r: realm,
    lb: lookback,
    in: inflation,
  };

  try {
    const writer = new DataRepoWriter({ path: cfg.dataRepo.path, githubToken: "", owner: "", repo: "", branch: "main" });
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const subDir = `aggregates/inflation/realm-${realm}`;
    await writer.writeSnapshot(
      { timestamp, snapshotType: "inflation-report", data: report },
      subDir,
    );
    logger.info(`[realm ${realm}] Inflation: ${Object.keys(inflation).length} categories tracked over ${lookback}d`);
    return { ok: true, report: inflation };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, report: null, error: `write failed: ${msg}` };
  }
}

export async function runAllInflationTracking(): Promise<{ ok: boolean; results: Array<{ realm: number; ok: boolean }> }> {
  const cfg = loadConfig();
  const results = await Promise.allSettled(
    cfg.simco.realms.map(async (r) => {
      const res = await runInflationTracking(r);
      return { realm: r, ok: res.ok };
    }),
  );

  const fulfilled: Array<{ realm: number; ok: boolean }> = [];
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

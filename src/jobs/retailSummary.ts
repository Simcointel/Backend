import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { loadConfig } from "../config/index.js";
import { logger } from "../logging/logger.js";
import { DataRepoWriter } from "../storage/dataRepoWriter.js";
import type { MarketSnapshot } from "./fetchJob.js";

export interface RetailSummaryData {
  t: string;
  r: number;
  retail: Record<string, { saturation: number; sellers: number }>;
}

function findLatestSnapshot(dataRepoPath: string, realm: number): string | null {
  const dir = resolve(dataRepoPath, "snapshots", "market", `realm-${realm}`);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("market-snapshot-") && f.endsWith(".json"))
    .sort().reverse();
  return files.length > 0 ? join(dir, files[0]) : null;
}

export async function runRetailSummary(realm: number): Promise<{ ok: boolean; error?: string }> {
  const cfg = loadConfig();
  const snapshotPath = findLatestSnapshot(cfg.dataRepo.path, realm);
  if (!snapshotPath) return { ok: false, error: "no market snapshot found" };

  let snapshot: MarketSnapshot;
  try {
    snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8")) as MarketSnapshot;
  } catch (err) {
    return { ok: false, error: `failed to read snapshot: ${err}` };
  }

  const retail: Record<string, { saturation: number; sellers: number }> = {};

  for (const r of snapshot.rc) {
    if (!r.ri || r.ri.length === 0) continue;
    // ponytail: extract first entry's saturation/sellers; adjust if API shape differs
    const first = r.ri[0] as Record<string, unknown> | undefined;
    const saturation = typeof first?.saturation === "number" ? first.saturation
      : typeof first?.saturationPercent === "number" ? first.saturationPercent
      : typeof first?.saturation_pct === "number" ? first.saturation_pct
      : 0;
    const sellers = typeof first?.sellers === "number" ? first.sellers
      : typeof first?.activeSellers === "number" ? first.activeSellers
      : 0;
    if (saturation > 0 || sellers > 0) {
      retail[String(r.i)] = { saturation, sellers };
    }
  }

  const summary: RetailSummaryData = {
    t: new Date().toISOString(),
    r: realm,
    retail,
  };

  try {
    const writer = new DataRepoWriter({ path: cfg.dataRepo.path, githubToken: "", owner: "", repo: "", branch: "main" });
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    await writer.writeSnapshot(
      { timestamp, snapshotType: "retail-summary", data: summary },
      `aggregates/retail/realm-${realm}`,
    );
    logger.info(`[realm ${realm}] Retail summary: ${Object.keys(retail).length} resources`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `write failed: ${err}` };
  }
}

export async function runAllRetailSummaries(): Promise<{ ok: boolean; count: number }> {
  const cfg = loadConfig();
  let ok = true;
  let count = 0;
  for (const realm of cfg.simco.realms) {
    const res = await runRetailSummary(realm);
    if (res.ok) count++;
    else { ok = false; logger.warn(`[realm ${realm}] Retail summary failed: ${res.error}`); }
  }
  logger.info(`Retail summaries: ${count}/${cfg.simco.realms.length} realms ok`);
  return { ok, count };
}

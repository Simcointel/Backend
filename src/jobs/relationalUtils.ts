import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { loadConfig } from "../config/index.js";
import { getDataRoot } from "./intelligenceUtils.js";

export { getDataRoot };

function loadLatestIntelligenceFile(realm: number, prefix: string): unknown | null {
  const dir = resolve(getDataRoot(), "aggregates", "intelligence", `realm-${realm}`);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort().reverse();
  if (files.length === 0) return null;
  try { return JSON.parse(readFileSync(join(dir, files[0]), "utf-8")); }
  catch { return null; }
}

export function loadLatestMomentum(realm: number): Record<string, { st: number; mt: number; ac: number; ts: number }> | null {
  const data = loadLatestIntelligenceFile(realm, "momentum") as Record<string, unknown> | null;
  if (!data) return null;
  return (data as { momentum: Record<string, { st: number; mt: number; ac: number; ts: number }> }).momentum || null;
}

export function loadLatestVolatility(realm: number): Record<string, { v5: number; v20: number; as: number; is: number }> | null {
  const data = loadLatestIntelligenceFile(realm, "volatility") as Record<string, unknown> | null;
  if (!data) return null;
  return (data as { vol: Record<string, { v5: number; v20: number; as: number; is: number }> }).vol || null;
}

export function loadLatestStress(realm: number): { stress: Record<string, { ri: boolean; cp: boolean; scp: number; oh: boolean; cs: boolean; flags: string[] }>; rs: { os: number; af: number; tf: number } } | null {
  const data = loadLatestIntelligenceFile(realm, "stress") as Record<string, unknown> | null;
  if (!data) return null;
  return data as { stress: Record<string, { ri: boolean; cp: boolean; scp: number; oh: boolean; cs: boolean; flags: string[] }>; rs: { os: number; af: number; tf: number } };
}

export function loadLatestRegime(realm: number): { cr: string; rc: number; rf: { cvGrowth: number; acGrowth: number; avgInflation: number; avgStress: number; avgVolatility: number; phase: string } } | null {
  const data = loadLatestIntelligenceFile(realm, "regime") as Record<string, unknown> | null;
  if (!data) return null;
  return data as { cr: string; rc: number; rf: { cvGrowth: number; acGrowth: number; avgInflation: number; avgStress: number; avgVolatility: number; phase: string } };
}

export function loadCategoryIndexHistory(realm: number, limit: number): Array<{ ts: string; values: Record<string, number> }> {
  const dir = resolve(getDataRoot(), "aggregates", "indexes", `realm-${realm}`);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.startsWith("price-indexes-") && f.endsWith(".json"))
    .sort()
    .slice(-limit)
    .map((f) => {
      try {
        const d = JSON.parse(readFileSync(join(dir, f), "utf-8")) as { t: string; ix: Record<string, { v: number }> };
        const values: Record<string, number> = {};
        for (const [k, v] of Object.entries(d.ix)) values[k] = v.v;
        return { ts: d.t, values };
      } catch { return null; }
    })
    .filter((d): d is { ts: string; values: Record<string, number> } => d !== null);
}

export function getCategories(): string[] {
  return Object.keys(loadConfig().macroIndexes.categories);
}

export function makeEventId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function severityFromZScore(zs: number, criticalThreshold: number, warningThreshold: number): string {
  if (Math.abs(zs) >= criticalThreshold) return "critical";
  if (Math.abs(zs) >= warningThreshold) return "warning";
  return "info";
}

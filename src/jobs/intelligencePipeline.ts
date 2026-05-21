import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { getDataRoot } from "./intelligenceUtils.js";
import { computeMomentum } from "./momentumEngine.js";
import { computeVolatility } from "./volatilityEngine.js";
import { computeStress } from "./stressEngine.js";
import { computeRegime } from "./regimeEngine.js";
import { computeLeaders, computeSectors } from "./commodityIntelligence.js";
import { emit } from "../events/eventBus.js";

export interface IntelligencePipelineResult {
  ok: boolean;
  momentum: { ok: boolean; count: number };
  volatility: { ok: boolean; count: number };
  stress: { ok: boolean; count: number };
  regime: { ok: boolean; count: number };
  leaders: { ok: boolean; count: number };
  sectors: { ok: boolean; count: number };
  durationsMs: {
    total: number;
    momentum: number;
    volatility: number;
    stress: number;
    regime: number;
    leaders: number;
    sectors: number;
  };
}

function writeIntelligenceFile(realm: number, type: string, data: unknown): void {
  const cfg = loadConfig();
  const dir = resolve(getDataRoot(), "aggregates", "intelligence", `realm-${realm}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const filePath = resolve(dir, `${type}-${timestamp}.json`);
  writeFileSync(filePath, JSON.stringify(data) + "\n", "utf-8");
}

async function computeWrapper<T>(label: string, enabled: boolean, realmCompute: (r: number) => T, write: (r: number, data: T) => void): Promise<{ ok: boolean; results: T[] }> {
  if (!enabled) return { ok: true, results: [] };
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try { return realmCompute(r); }
    catch (err) {
      logger.error(`[${label}] realm ${r} failed: ${err instanceof Error ? err.message : String(err)}`);
      return null as unknown as T;
    }
  });
  const valid = results.filter((r): r is T => r !== null && (r as Record<string, unknown>).ok !== false);
  const ok = valid.length > 0 || results.length === 0;
  for (const r of valid) write((r as Record<string, unknown>).r as number, r);
  logger.info(`${label}: ${valid.length}/${results.length} realms ok`);
  return { ok, results: valid };
}

export async function runIntelligencePipeline(): Promise<IntelligencePipelineResult> {
  const start = Date.now();
  const cfg = loadConfig();

  logger.info("=== Intelligence Pipeline Start ===");

  if (!cfg.intelligence.enableRealmIntelligence) {
    logger.info("Intelligence pipeline disabled by config");
    return {
      ok: true,
      momentum: { ok: true, count: 0 },
      volatility: { ok: true, count: 0 },
      stress: { ok: true, count: 0 },
      regime: { ok: true, count: 0 },
      leaders: { ok: true, count: 0 },
      sectors: { ok: true, count: 0 },
      durationsMs: { total: 0, momentum: 0, volatility: 0, stress: 0, regime: 0, leaders: 0, sectors: 0 },
    };
  }

  let mStart = Date.now();
  const momentumResult = await computeWrapper("Momentum", cfg.intelligence.enableMomentum,
    (r) => computeMomentum(r), (r, d) => writeIntelligenceFile(r, "momentum", d));
  const momentumDuration = Date.now() - mStart;

  let vStart = Date.now();
  const volatilityResult = await computeWrapper("Volatility", cfg.intelligence.enableVolatility,
    (r) => computeVolatility(r), (r, d) => writeIntelligenceFile(r, "volatility", d));
  const volatilityDuration = Date.now() - vStart;

  let stressStart = Date.now();
  const stressResult = await computeWrapper("Stress", cfg.intelligence.enableStress,
    (r) => computeStress(r), (r, d) => writeIntelligenceFile(r, "stress", d));
  const stressDuration = Date.now() - stressStart;

  let regStart = Date.now();
  const regimeResult = await computeWrapper("Regime", cfg.intelligence.enableRegime,
    (r) => computeRegime(r), (r, d) => writeIntelligenceFile(r, "regime", d));
  const regimeDuration = Date.now() - regStart;

  let lStart = Date.now();
  const leadersResult = await computeWrapper("Leaders", cfg.intelligence.enableLeaders,
    (r) => computeLeaders(r), (r, d) => writeIntelligenceFile(r, "leaders", d));
  const leadersDuration = Date.now() - lStart;

  let sStart = Date.now();
  const sectorsResult = await computeWrapper("Sectors", cfg.intelligence.enableLeaders,
    (r) => computeSectors(r), (r, d) => writeIntelligenceFile(r, "sectors", d));
  const sectorsDuration = Date.now() - sStart;

  const totalDuration = Date.now() - start;

  logger.info(`=== Intelligence Pipeline Complete in ${totalDuration}ms ===`);
  logger.info(`  momentum:  ${momentumResult.ok ? "OK" : "FAIL"} (${momentumDuration}ms, ${momentumResult.results.length} realms)`);
  logger.info(`  volatility:${volatilityResult.ok ? "OK" : "FAIL"} (${volatilityDuration}ms, ${volatilityResult.results.length} realms)`);
  logger.info(`  stress:    ${stressResult.ok ? "OK" : "FAIL"} (${stressDuration}ms, ${stressResult.results.length} realms)`);
  logger.info(`  regime:    ${regimeResult.ok ? "OK" : "FAIL"} (${regimeDuration}ms, ${regimeResult.results.length} realms)`);
  logger.info(`  leaders:   ${leadersResult.ok ? "OK" : "FAIL"} (${leadersDuration}ms, ${leadersResult.results.length} realms)`);
  logger.info(`  sectors:   ${sectorsResult.ok ? "OK" : "FAIL"} (${sectorsDuration}ms, ${sectorsResult.results.length} realms)`);

  const allEngineOk = momentumResult.ok && volatilityResult.ok && stressResult.ok && regimeResult.ok && leadersResult.ok && sectorsResult.ok;
  emit("pipeline:intelligence:complete", {
    ok: allEngineOk, duration: totalDuration, realms: cfg.simco.realms,
    regimeCount: regimeResult.results.length,
  });

  return {
    ok: momentumResult.ok && volatilityResult.ok && stressResult.ok && regimeResult.ok && leadersResult.ok && sectorsResult.ok,
    momentum: { ok: momentumResult.ok, count: momentumResult.results.length },
    volatility: { ok: volatilityResult.ok, count: volatilityResult.results.length },
    stress: { ok: stressResult.ok, count: stressResult.results.length },
    regime: { ok: regimeResult.ok, count: regimeResult.results.length },
    leaders: { ok: leadersResult.ok, count: leadersResult.results.length },
    sectors: { ok: sectorsResult.ok, count: sectorsResult.results.length },
    durationsMs: {
      total: totalDuration, momentum: momentumDuration, volatility: volatilityDuration,
      stress: stressDuration, regime: regimeDuration, leaders: leadersDuration, sectors: sectorsDuration,
    },
  };
}

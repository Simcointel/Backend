import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { getDataRoot } from "./intelligenceUtils.js";
import { computeForecasts } from "./forecastEngine.js";
import { runAllSimulations } from "./simulationEngine.js";
import { computeDependencies } from "./dependencyEngine.js";
import { generateSignals } from "./signalEngine.js";
import { detectCycle } from "./cycleEngine.js";
import { emit } from "../events/eventBus.js";

export interface PipelineComponentResult {
  ok: boolean;
  count: number;
  durationMs: number;
}

export interface ForecastPipelineResult {
  ok: boolean;
  durationMs: number;
  forecasts: PipelineComponentResult;
  simulations: PipelineComponentResult;
  dependencies: PipelineComponentResult;
  signals: PipelineComponentResult;
  cycles: PipelineComponentResult;
}

function storeResult(dir: string, prefix: string, data: unknown): void {
  const ts = new Date().toISOString().replace(/:/g, "-");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, prefix + "-" + ts + ".json"), JSON.stringify(data) + "\n", "utf-8");
}

export function runForecastPipeline(realm: number): ForecastPipelineResult {
  const start = Date.now();
  const cfg = loadConfig();
  const baseDir = resolve(getDataRoot(), "aggregates");

  const fStart = Date.now();
  let fOk = false;
  let fCount = 0;
  try {
    const fr = computeForecasts(realm);
    fOk = fr.ok;
    fCount = Object.keys(fr.series).length;
    if (fr.ok) storeResult(resolve(baseDir, "forecasts", "realm-" + realm), "forecast", fr);
  } catch (err) {
    logger.warn("[realm " + realm + "] Forecast engine error: " + (err instanceof Error ? err.message : String(err)));
  }
  const fDur = Date.now() - fStart;

  const sStart = Date.now();
  let sOk = false;
  let sCount = 0;
  try {
    const sr = runAllSimulations(realm);
    sOk = sr.ok;
    sCount = sr.results.length;
    if (sr.ok) storeResult(resolve(baseDir, "simulations", "realm-" + realm), "simulation", sr.results);
  } catch (err) {
    logger.warn("[realm " + realm + "] Simulation error: " + (err instanceof Error ? err.message : String(err)));
  }
  const sDur = Date.now() - sStart;

  const dStart = Date.now();
  let dOk = false;
  let dCount = 0;
  try {
    const dr = computeDependencies(realm);
    dOk = dr.ok;
    dCount = dr.risks.length;
    if (dr.ok) storeResult(resolve(baseDir, "dependencies", "realm-" + realm), "dependency", dr);
  } catch (err) {
    logger.warn("[realm " + realm + "] Dependency error: " + (err instanceof Error ? err.message : String(err)));
  }
  const dDur = Date.now() - dStart;

  const sgStart = Date.now();
  let sgOk = false;
  let sgCount = 0;
  try {
    const sgr = generateSignals(realm);
    sgOk = sgr.ok;
    sgCount = sgr.signals.length;
    if (sgr.ok) storeResult(resolve(baseDir, "signals", "realm-" + realm), "signals", sgr);
  } catch (err) {
    logger.warn("[realm " + realm + "] Signal error: " + (err instanceof Error ? err.message : String(err)));
  }
  const sgDur = Date.now() - sgStart;

  const cStart = Date.now();
  let cOk = false;
  let cCount = 0;
  try {
    const cr = detectCycle(realm);
    cOk = cr.ok;
    cCount = cr.current ? 1 : 0;
    if (cr.ok) storeResult(resolve(baseDir, "cycles", "realm-" + realm), "cycle", cr);
  } catch (err) {
    logger.warn("[realm " + realm + "] Cycle error: " + (err instanceof Error ? err.message : String(err)));
  }
  const cDur = Date.now() - cStart;

  const totalDur = Date.now() - start;
  const allOk = fOk || sOk || dOk || sgOk || cOk;

  emit("pipeline:forecast:complete", { realm, ok: allOk, durationMs: totalDur, forecasts: fCount, simulations: sCount, dependencies: dCount, signals: sgCount, cycles: cCount }, realm);

  logger.info("[realm " + realm + "] === Forecast Pipeline Complete in " + totalDur + "ms ===");
  logger.info("  forecasts:    " + (fOk ? "OK" : "FAIL") + " (" + fDur + "ms, " + fCount + " series)");
  logger.info("  simulations:  " + (sOk ? "OK" : "FAIL") + " (" + sDur + "ms, " + sCount + " scenarios)");
  logger.info("  dependencies: " + (dOk ? "OK" : "FAIL") + " (" + dDur + "ms, " + dCount + " risks)");
  logger.info("  signals:      " + (sgOk ? "OK" : "FAIL") + " (" + sgDur + "ms, " + sgCount + " signals)");
  logger.info("  cycles:       " + (cOk ? "OK" : "FAIL") + " (" + cDur + "ms, " + cCount + " cycles)");

  return {
    ok: allOk, durationMs: totalDur,
    forecasts: { ok: fOk, count: fCount, durationMs: fDur },
    simulations: { ok: sOk, count: sCount, durationMs: sDur },
    dependencies: { ok: dOk, count: dCount, durationMs: dDur },
    signals: { ok: sgOk, count: sgCount, durationMs: sgDur },
    cycles: { ok: cOk, count: cCount, durationMs: cDur },
  };
}

export function runAllForecastPipelines(): Promise<{ ok: boolean; results: ForecastPipelineResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try { return runForecastPipeline(r); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Forecast pipeline failed for realm " + r + ": " + msg);
      return {
        ok: false, durationMs: 0,
        forecasts: { ok: false, count: 0, durationMs: 0 },
        simulations: { ok: false, count: 0, durationMs: 0 },
        dependencies: { ok: false, count: 0, durationMs: 0 },
        signals: { ok: false, count: 0, durationMs: 0 },
        cycles: { ok: false, count: 0, durationMs: 0 },
      };
    }
  });
  const allOk = results.some((r) => r.ok);
  logger.info("Forecast pipelines: " + results.filter((r) => r.ok).length + "/" + results.length + " realms ok");
  return Promise.resolve({ ok: allOk, results });
}

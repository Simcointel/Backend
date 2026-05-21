import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { getDataRoot } from "./intelligenceUtils.js";
import { computeCorrelations, type CorrelationResult } from "./correlationEngine.js";
import { detectAnomalies, type AnomalyResult } from "./anomalyEngine.js";
import { detectDivergences, type DivergenceResult } from "./divergenceEngine.js";
import { detectContagion, type ContagionResult } from "./contagionEngine.js";
import { generateEvents, type AlertEvent } from "./alertEngine.js";
import { emit } from "../events/eventBus.js";

export interface RelationalPipelineResult {
  ok: boolean;
  correlations: { ok: boolean; count: number };
  anomalies: { ok: boolean; count: number };
  divergences: { ok: boolean; count: number };
  contagion: { ok: boolean; count: number };
  alerts: { ok: boolean; count: number };
  durationsMs: { total: number; correlations: number; anomalies: number; divergences: number; contagion: number; alerts: number };
}

function writeRelationalFile(realm: number, subDir: string, prefix: string, data: unknown): void {
  const dir = resolve(getDataRoot(), "aggregates", subDir, `realm-${realm}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/:/g, "-");
  writeFileSync(resolve(dir, `${prefix}-${ts}.json`), JSON.stringify(data) + "\n", "utf-8");
}

async function runWrapper<T>(label: string, enabled: boolean, fn: () => Promise<{ ok: boolean; results: T[] }>, subDir: string, prefix: string): Promise<{ ok: boolean; results: T[] }> {
  if (!enabled) return { ok: true, results: [] };
  const result = await fn();
  if (result.ok) {
    for (const r of result.results) {
      const realm = (r as Record<string, unknown>).r as number;
      writeRelationalFile(realm, subDir, prefix, r);
    }
  }
  logger.info(`${label}: ${result.ok ? "OK" : "PARTIAL"} (${result.results.length} realms)`);
  return result;
}

export async function runRelationalPipeline(): Promise<RelationalPipelineResult> {
  const start = Date.now();
  const cfg = loadConfig();

  logger.info("=== Relational Intelligence Pipeline Start ===");

  if (!cfg.relational.enableRelationalPipeline) {
    logger.info("Relational pipeline disabled by config");
    return {
      ok: true, correlations: { ok: true, count: 0 }, anomalies: { ok: true, count: 0 },
      divergences: { ok: true, count: 0 }, contagion: { ok: true, count: 0 },
      alerts: { ok: true, count: 0 },
      durationsMs: { total: 0, correlations: 0, anomalies: 0, divergences: 0, contagion: 0, alerts: 0 },
    };
  }

  const cStart = Date.now();
  const corrResult = await runWrapper("Correlations", cfg.relational.enableCorrelations, computeAllCorrelationsWrap, "correlations", "correlation");
  const corrDuration = Date.now() - cStart;

  const aStart = Date.now();
  const anomResult = await runWrapper("Anomalies", cfg.relational.enableAnomalies, detectAllAnomaliesWrap, "anomalies", "anomaly");
  const anomDuration = Date.now() - aStart;

  const dStart = Date.now();
  const divResult = await runWrapper("Divergences", cfg.relational.enableDivergence, detectAllDivergencesWrap, "divergence", "divergence");
  const divDuration = Date.now() - dStart;

  const conStart = Date.now();
  const contResult = await runWrapper("Contagion", cfg.relational.enableContagion, detectAllContagionWrap, "contagion", "contagion");
  const conDuration = Date.now() - conStart;

  const alStart = Date.now();
  let alertCount = 0;
  if (cfg.relational.enableAlerting) {
    const realms = cfg.simco.realms;
    const anomResults = anomResult.results as AnomalyResult[];
    const divResults = divResult.results as DivergenceResult[];
    const contResults = contResult.results as ContagionResult[];

    for (let i = 0; i < realms.length; i++) {
      const realm = realms[i];
      const anomalies = anomResults[i]?.an || [];
      const divergences = divResults[i]?.di || [];
      const contagion = contResults[i]?.co || [];
      const events = generateEvents(realm, anomalies, divergences, contagion);
      alertCount += events.length;
    }
  }
  const alertDuration = Date.now() - alStart;

  const totalDuration = Date.now() - start;

  logger.info(`=== Relational Pipeline Complete in ${totalDuration}ms ===`);
  logger.info(`  correlations: ${corrResult.ok ? "OK" : "FAIL"} (${corrDuration}ms)`);
  logger.info(`  anomalies:    ${anomResult.ok ? "OK" : "FAIL"} (${anomDuration}ms, ${(anomResult.results as AnomalyResult[]).reduce((s, r) => s + (r.an?.length || 0), 0)} events)`);
  logger.info(`  divergences:  ${divResult.ok ? "OK" : "FAIL"} (${divDuration}ms, ${(divResult.results as DivergenceResult[]).reduce((s, r) => s + (r.di?.length || 0), 0)} events)`);
  logger.info(`  contagion:    ${contResult.ok ? "OK" : "FAIL"} (${conDuration}ms, ${(contResult.results as ContagionResult[]).reduce((s, r) => s + (r.co?.length || 0), 0)} signals)`);
  logger.info(`  alerts:       generated ${alertCount} events (${alertDuration}ms)`);

  const anomEventCount = (anomResult.results as AnomalyResult[]).reduce((s, r) => s + (r.an?.length || 0), 0);
  emit("pipeline:relational:complete", {
    ok: true, duration: totalDuration, realms: cfg.simco.realms,
    anomalyCount: anomEventCount, divergenceCount: divResult.results.length, alertCount,
  });

  if (alertCount > 0) {
    emit("alert:generated", { count: alertCount, realm: cfg.simco.realms[0] });
  }

  return {
    ok: true,
    correlations: { ok: corrResult.ok, count: corrResult.results.length },
    anomalies: { ok: anomResult.ok, count: (anomResult.results as AnomalyResult[]).reduce((s, r) => s + (r.an?.length || 0), 0) },
    divergences: { ok: divResult.ok, count: (divResult.results as DivergenceResult[]).reduce((s, r) => s + (r.di?.length || 0), 0) },
    contagion: { ok: contResult.ok, count: (contResult.results as ContagionResult[]).reduce((s, r) => s + (r.co?.length || 0), 0) },
    alerts: { ok: true, count: alertCount },
    durationsMs: {
      total: totalDuration, correlations: corrDuration, anomalies: anomDuration,
      divergences: divDuration, contagion: conDuration, alerts: alertDuration,
    },
  };
}

async function computeAllCorrelationsWrap(): Promise<{ ok: boolean; results: CorrelationResult[] }> {
  const { computeAllCorrelations } = await import("./correlationEngine.js");
  return computeAllCorrelations();
}
async function detectAllAnomaliesWrap(): Promise<{ ok: boolean; results: AnomalyResult[] }> {
  const { detectAllAnomalies } = await import("./anomalyEngine.js");
  return detectAllAnomalies();
}
async function detectAllDivergencesWrap(): Promise<{ ok: boolean; results: DivergenceResult[] }> {
  const { detectAllDivergences } = await import("./divergenceEngine.js");
  return detectAllDivergences();
}
async function detectAllContagionWrap(): Promise<{ ok: boolean; results: ContagionResult[] }> {
  const { detectAllContagion } = await import("./contagionEngine.js");
  return detectAllContagion();
}

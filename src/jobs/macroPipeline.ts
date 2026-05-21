import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { runAllRealmMetrics } from "./realmMetrics.js";
import { runAllPriceIndexes } from "./priceIndex.js";
import { runAllInflationTracking } from "./macroInflation.js";
import { runAllHistorySync } from "./macroHistory.js";
import { runFetch } from "./fetchJob.js";

export interface MacroPipelineResult {
  ok: boolean;
  realmMetrics: { ok: boolean };
  priceIndexes: { ok: boolean };
  inflation: { ok: boolean };
  historySync: { ok: boolean; newEntries: number };
  durationsMs: {
    total: number;
    realmMetrics: number;
    priceIndexes: number;
    inflation: number;
    historySync: number;
  };
}

export async function runMacroPipeline(): Promise<MacroPipelineResult> {
  const start = Date.now();
  const cfg = loadConfig();

  logger.info("=== Macro Pipeline Start ===");

  let rmStart = Date.now();
  let realmMetricsResult = { ok: true };
  if (cfg.macroSettings.enableRealmMetrics) {
    realmMetricsResult = await runAllRealmMetrics();
  } else {
    logger.info("Realm metrics disabled by config");
  }
  const realmMetricsDuration = Date.now() - rmStart;

  let piStart = Date.now();
  let priceIndexesResult = { ok: true };
  if (cfg.macroSettings.enablePriceIndexes) {
    priceIndexesResult = await runAllPriceIndexes();
  } else {
    logger.info("Price indexes disabled by config");
  }
  const priceIndexesDuration = Date.now() - piStart;

  let infStart = Date.now();
  let inflationResult = { ok: true };
  if (cfg.macroSettings.enableInflationTracking) {
    inflationResult = await runAllInflationTracking();
  } else {
    logger.info("Inflation tracking disabled by config");
  }
  const inflationDuration = Date.now() - infStart;

  let hsStart = Date.now();
  let historySyncResult: { ok: boolean; results?: Array<{ ok: boolean; newEntries?: number }> } = { ok: true };
  if (cfg.macroHistory.enableHistoryIngestion) {
    historySyncResult = await runAllHistorySync();
  } else {
    logger.info("History ingestion disabled by config");
  }
  const historySyncDuration = Date.now() - hsStart;

  const totalDuration = Date.now() - start;
  const allOk = realmMetricsResult.ok && priceIndexesResult.ok && inflationResult.ok && historySyncResult.ok;

  logger.info(`=== Macro Pipeline Complete in ${totalDuration}ms ===`);
  logger.info(`  realmMetrics: ${realmMetricsResult.ok ? "OK" : "FAIL"} (${realmMetricsDuration}ms)`);
  logger.info(`  priceIndexes: ${priceIndexesResult.ok ? "OK" : "FAIL"} (${priceIndexesDuration}ms)`);
  logger.info(`  inflation:    ${inflationResult.ok ? "OK" : "FAIL"} (${inflationDuration}ms)`);
  const histNew = historySyncResult.results?.reduce((s, r) => s + (r.newEntries || 0), 0) || 0;
  logger.info(`  historySync:  ${historySyncResult.ok ? "OK" : "FAIL"} (${historySyncDuration}ms, ${histNew} new)`);

  return {
    ok: allOk,
    realmMetrics: realmMetricsResult,
    priceIndexes: priceIndexesResult,
    inflation: inflationResult,
    historySync: { ok: historySyncResult.ok, newEntries: histNew },
    durationsMs: {
      total: totalDuration,
      realmMetrics: realmMetricsDuration,
      priceIndexes: priceIndexesDuration,
      inflation: inflationDuration,
      historySync: historySyncDuration,
    },
  };
}

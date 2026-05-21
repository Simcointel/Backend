import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { computeAllDashboardSummaries } from "./dashboardEngine.js";
import { getOperationalStatus, updatePipelineRun } from "./operationalStatus.js";
import { getUnifiedFeed } from "./eventFeed.js";
import { loadEvents } from "./alertEngine.js";
import { deliverAlerts } from "./alertDelivery.js";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { getDataRoot } from "./intelligenceUtils.js";
import { emit } from "../events/eventBus.js";

export interface DashboardPipelineResult {
  ok: boolean;
  summaries: { ok: boolean; count: number };
  operational: { ok: boolean };
  feed: { ok: boolean; events: number };
  alerts: { ok: boolean; delivered: number };
  durationsMs: { total: number; summaries: number; operational: number; feed: number; alerts: number };
}

export async function runDashboardPipeline(): Promise<DashboardPipelineResult> {
  const start = Date.now();
  const cfg = loadConfig();

  logger.info("=== Dashboard Pipeline Start ===");

  if (!cfg.dashboard.enableDashboardPipeline) {
    logger.info("Dashboard pipeline disabled by config");
    return { ok: true, summaries: { ok: true, count: 0 }, operational: { ok: true }, feed: { ok: true, events: 0 }, alerts: { ok: true, delivered: 0 }, durationsMs: { total: 0, summaries: 0, operational: 0, feed: 0, alerts: 0 } };
  }

  const sStart = Date.now();
  const summaryResult = await computeAllDashboardSummaries();
  const summaryDuration = Date.now() - sStart;

  const oStart = Date.now();
  let opOk = true;
  try {
    const opStatus = getOperationalStatus();
    const dir = resolve(getDataRoot(), "aggregates", "system", "operational");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `status-${new Date().toISOString().replace(/:/g, "-")}.json`), JSON.stringify(opStatus) + "\n", "utf-8");
  } catch (err) {
    opOk = false;
    logger.warn("Operational status failed", err instanceof Error ? err.message : String(err));
  }
  const operationalDuration = Date.now() - oStart;

  const fStart = Date.now();
  let feedOk = true;
  let totalEvents = 0;
  try {
    for (const r of cfg.simco.realms) {
      const feed = getUnifiedFeed(r);
      totalEvents += feed.events.length;
    }
  } catch (err) {
    feedOk = false;
    logger.warn("Event feed generation failed", err instanceof Error ? err.message : String(err));
  }
  const feedDuration = Date.now() - fStart;

  const aStart = Date.now();
  let delivered = 0;
  try {
    for (const r of cfg.simco.realms) {
      const newEvents = loadEvents(r).filter((e) => {
        const ex = new Date(e.ex).getTime();
        const dayAgo = Date.now() - 86400000;
        return ex > dayAgo && new Date(e.ts).getTime() > Date.now() - 300000;
      });
      if (newEvents.length > 0) {
        deliverAlerts(newEvents);
        delivered += newEvents.filter((e) => e.se === "critical" || e.se === "warning").length;
      }
    }
  } catch (err) {
    logger.warn("Alert delivery failed", err instanceof Error ? err.message : String(err));
  }
  const alertDuration = Date.now() - aStart;

  const totalDuration = Date.now() - start;

  updatePipelineRun("dashboard", summaryResult.ok, summaryDuration);

  logger.info(`=== Dashboard Pipeline Complete in ${totalDuration}ms ===`);
  logger.info(`  summaries:    ${summaryResult.ok ? "OK" : "FAIL"} (${summaryDuration}ms, ${summaryResult.results.length} realms)`);
  logger.info(`  operational:  ${opOk ? "OK" : "FAIL"} (${operationalDuration}ms)`);
  logger.info(`  feed:         ${feedOk ? "OK" : "FAIL"} (${feedDuration}ms, ${totalEvents} events)`);
  logger.info(`  alerts:       ${delivered > 0 ? `delivered ${delivered}` : "no alerts"} (${alertDuration}ms)`);

  emit("pipeline:dashboard:complete", {
    ok: summaryResult.ok && opOk, duration: totalDuration, realms: cfg.simco.realms.length,
    summaries: summaryResult.results.length, events: totalEvents, delivered,
  });

  return {
    ok: summaryResult.ok && opOk,
    summaries: { ok: summaryResult.ok, count: summaryResult.results.length },
    operational: { ok: opOk },
    feed: { ok: feedOk, events: totalEvents },
    alerts: { ok: true, delivered },
    durationsMs: {
      total: totalDuration, summaries: summaryDuration, operational: operationalDuration,
      feed: feedDuration, alerts: alertDuration,
    },
  };
}

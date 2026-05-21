import { loadConfig } from "../config/index.js";
import { computeDashboardSummary } from "../jobs/dashboardEngine.js";
import { getOperationalStatus } from "../jobs/operationalStatus.js";
import { getUnifiedFeed } from "../jobs/eventFeed.js";
import { loadEvents } from "../jobs/alertEngine.js";

export interface HydrationPayload {
  t: string;
  r: number[];
  dashboard: Record<string, unknown>;
  sectors: Record<string, unknown>;
  regimes: Record<string, unknown>;
  alerts: Record<string, unknown>;
  events: Record<string, unknown>;
  operational: Record<string, unknown>;
  meta: {
    apiVersion: string;
    generatedAt: string;
    realmCount: number;
  };
}

export function generateHydrationPayload(): HydrationPayload {
  const cfg = loadConfig();
  const realms = cfg.simco.realms;
  const ts = new Date().toISOString();

  const dashboard: Record<string, unknown> = {};
  const sectors: Record<string, unknown> = {};
  const regimes: Record<string, unknown> = {};
  const alerts: Record<string, unknown> = {};
  const events: Record<string, unknown> = {};

  for (const r of realms) {
    try {
      const summary = computeDashboardSummary(r);
      if (summary.ok) dashboard[`realm-${r}`] = summary;
    } catch { /* skip */ }

    try {
      const feed = getUnifiedFeed(r, undefined, undefined, 50);
      events[`realm-${r}`] = feed;
    } catch { /* skip */ }

    try {
      const ev = loadEvents(r, 20);
      alerts[`realm-${r}`] = { events: ev, total: ev.length };
    } catch { /* skip */ }
  }

  const operational = getOperationalStatus() as unknown as Record<string, unknown>;

  return {
    t: ts,
    r: realms,
    dashboard,
    sectors,
    regimes,
    alerts,
    events,
    operational,
    meta: {
      apiVersion: cfg.network.apiVersion || "1.0",
      generatedAt: ts,
      realmCount: realms.length,
    },
  };
}

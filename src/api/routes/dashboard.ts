import { IncomingMessage, ServerResponse } from "http";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { sendSuccess, sendError } from "../middleware.js";
import { loadConfig } from "../../config/index.js";
import { getDataRoot } from "../../jobs/intelligenceUtils.js";
import { computeDashboardSummary } from "../../jobs/dashboardEngine.js";
import { getOperationalStatus } from "../../jobs/operationalStatus.js";
import { getUnifiedFeed } from "../../jobs/eventFeed.js";
import { loadEvents } from "../../jobs/alertEngine.js";

function getLatestStoredSummary(realm: number): unknown | null {
  const dir = resolve(getDataRoot(), "aggregates", "dashboard", `realm-${realm}`);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.startsWith("summary-") && f.endsWith(".json")).sort().reverse();
  if (files.length === 0) return null;
  try { return JSON.parse(readFileSync(join(dir, files[0]), "utf-8")); }
  catch { return null; }
}

function collectRealms(): number[] {
  return loadConfig().simco.realms;
}

function parseFilters(url: string): { severity?: string; category?: string; realm?: string; limit: number } {
  const u = new URL(url, "http://localhost");
  return {
    severity: u.searchParams.get("severity") || undefined,
    category: u.searchParams.get("category") || undefined,
    realm: u.searchParams.get("realm") || undefined,
    limit: parseInt(u.searchParams.get("limit") || "200", 10),
  };
}

export async function handleDashboardSummary(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const stored = getLatestStoredSummary(r);
    if (stored) result[`realm-${r}`] = stored;
  }
  sendSuccess(res, result);
}

export async function handleDashboardState(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    try {
      const summary = computeDashboardSummary(r);
      if (summary.ok) result[`realm-${r}`] = summary;
    } catch (err) {
      result[`realm-${r}`] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  sendSuccess(res, result);
}

export async function handleDashboardHealth(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { generateHealthReport } = await import("../../health/health.js");
  const health = await generateHealthReport();
  const op = getOperationalStatus();
  sendSuccess(res, {
    health,
    operational: op,
    generatedAt: new Date().toISOString(),
  });
}

export async function handleDashboardEvents(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const filters = parseFilters(req.url || "");
  const realms = filters.realm ? [parseInt(filters.realm.replace("realm-", ""), 10)].filter((n) => !isNaN(n)) : collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const feed = getUnifiedFeed(r, filters.severity, filters.category, filters.limit);
    result[`realm-${r}`] = feed;
  }
  sendSuccess(res, result);
}

export async function handleDashboardAlerts(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const events = loadEvents(r);
    result[`realm-${r}`] = { events, total: events.length };
  }
  sendSuccess(res, result);
}

export async function handleDashboardSectors(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const dir = resolve(getDataRoot(), "aggregates", "intelligence", `realm-${r}`);
    if (!existsSync(dir)) { result[`realm-${r}`] = null; continue; }
    const files = readdirSync(dir).filter((f) => f.startsWith("sectors-") && f.endsWith(".json")).sort().reverse();
    if (files.length > 0) {
      try { result[`realm-${r}`] = JSON.parse(readFileSync(join(dir, files[0]), "utf-8")); }
      catch { result[`realm-${r}`] = null; }
    } else {
      result[`realm-${r}`] = null;
    }
  }
  sendSuccess(res, result);
}

export async function handleDashboardSystem(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const op = getOperationalStatus();
  const dir = resolve(getDataRoot(), "aggregates", "system", "operational");
  let history: unknown[] = [];
  if (existsSync(dir)) {
    history = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 20).map((f) => {
      try { return JSON.parse(readFileSync(join(dir, f), "utf-8")); }
      catch { return null; }
    }).filter(Boolean);
  }
  sendSuccess(res, { current: op, history });
}

import { IncomingMessage, ServerResponse } from "http";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { sendSuccess, sendError } from "../middleware.js";
import { loadConfig } from "../../config/index.js";
import { getDataRoot } from "../../jobs/intelligenceUtils.js";
import { loadEvents } from "../../jobs/alertEngine.js";

function getLatestRelationalFile(realm: number, subDir: string, prefix: string): unknown | null {
  const dir = resolve(getDataRoot(), "aggregates", subDir, `realm-${realm}`);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort().reverse();
  if (files.length === 0) return null;
  try { return JSON.parse(readFileSync(join(dir, files[0]), "utf-8")); }
  catch { return null; }
}

function collectRealms(): number[] {
  return loadConfig().simco.realms;
}

export async function handleRelationalCorrelations(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const latest = getLatestRelationalFile(r, "correlations", "correlation");
    if (latest) result[`realm-${r}`] = latest;
  }
  sendSuccess(res, result);
}

export async function handleRelationalAnomalies(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const latest = getLatestRelationalFile(r, "anomalies", "anomaly");
    if (latest) result[`realm-${r}`] = latest;
  }
  sendSuccess(res, result);
}

export async function handleRelationalDivergence(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const latest = getLatestRelationalFile(r, "divergence", "divergence");
    if (latest) result[`realm-${r}`] = latest;
  }
  sendSuccess(res, result);
}

export async function handleRelationalContagion(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const latest = getLatestRelationalFile(r, "contagion", "contagion");
    if (latest) result[`realm-${r}`] = latest;
  }
  sendSuccess(res, result);
}

export async function handleRelationalAlerts(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const url = new URL(req.url || "", "http://localhost");
  const limit = parseInt(url.searchParams.get("limit") || "100", 10);

  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const events = loadEvents(r, limit);
    result[`realm-${r}`] = { events, total: events.length };
  }
  sendSuccess(res, result);
}

export async function handleRelationalEvents(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const events: Record<string, unknown> = {};
    const dir = resolve(getDataRoot(), "aggregates", "events", `realm-${r}`);
    if (existsSync(dir)) {
      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort().reverse()
        .slice(0, 30);
      for (const f of files) {
        try {
          const day = f.replace(".json", "");
          events[day] = JSON.parse(readFileSync(join(dir, f), "utf-8"));
        } catch { /* skip */ }
      }
    }
    result[`realm-${r}`] = events;
  }
  sendSuccess(res, result);
}

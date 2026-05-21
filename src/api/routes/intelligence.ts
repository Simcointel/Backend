import { getBaseUrl } from "../urlHelper.js";
import { IncomingMessage, ServerResponse } from "http";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { sendSuccess, sendError } from "../middleware.js";
import { loadConfig } from "../../config/index.js";
import { getDataRoot } from "../../jobs/intelligenceUtils.js";

function getLatestFile(realm: number, prefix: string): unknown | null {
  const dir = resolve(getDataRoot(), "aggregates", "intelligence", `realm-${realm}`);
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) return null;
  try {
    return JSON.parse(readFileSync(join(dir, files[0]), "utf-8"));
  } catch {
    return null;
  }
}

function getAllIntelligenceForRealm(realm: number, prefix: string, limit = 50): unknown[] {
  const dir = resolve(getDataRoot(), "aggregates", "intelligence", `realm-${realm}`);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => {
      try { return JSON.parse(readFileSync(join(dir, f), "utf-8")); }
      catch { return null; }
    })
    .filter(Boolean);
}

function collectRealms(): number[] {
  return loadConfig().simco.realms;
}

function parseLimit(req: IncomingMessage): number {
  const u = new URL(req.url || "", getBaseUrl(req));
  const l = parseInt(u.searchParams.get("limit") || "50", 10);
  return isNaN(l) ? 50 : l;
}

export async function handleIntelligenceMomentum(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const latest = getLatestFile(r, "momentum");
    if (latest) result[`realm-${r}`] = latest;
  }
  sendSuccess(res, result);
}

export async function handleIntelligenceVolatility(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const latest = getLatestFile(r, "volatility");
    if (latest) result[`realm-${r}`] = latest;
  }
  sendSuccess(res, result);
}

export async function handleIntelligenceStress(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const latest = getLatestFile(r, "stress");
    if (latest) result[`realm-${r}`] = latest;
  }
  sendSuccess(res, result);
}

export async function handleIntelligenceRegimes(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const latest = getLatestFile(r, "regime");
    if (latest) result[`realm-${r}`] = latest;
  }
  sendSuccess(res, result);
}

export async function handleIntelligenceLeaders(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const latest = getLatestFile(r, "leaders");
    if (latest) result[`realm-${r}`] = latest;
  }
  sendSuccess(res, result);
}

export async function handleIntelligenceSectors(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const realms = collectRealms();
  const result: Record<string, unknown> = {};
  for (const r of realms) {
    const latest = getLatestFile(r, "sectors");
    if (latest) result[`realm-${r}`] = latest;
  }
  sendSuccess(res, result);
}

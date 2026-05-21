import { IncomingMessage, ServerResponse } from "http";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve } from "path";
import { sendSuccess, sendError } from "../middleware.js";
import { loadConfig } from "../../config/index.js";
import { getDataRoot } from "../../jobs/intelligenceUtils.js";
import { computeForecasts } from "../../jobs/forecastEngine.js";
import { runSimulation } from "../../jobs/simulationEngine.js";
import { computeDependencies } from "../../jobs/dependencyEngine.js";
import { generateSignals } from "../../jobs/signalEngine.js";
import { detectCycle } from "../../jobs/cycleEngine.js";

function loadLatestJson(...paths: string[]): unknown | null {
  const dir = resolve(...paths);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
  if (files.length === 0) return null;
  try { return JSON.parse(readFileSync(resolve(dir, files[0]), "utf-8")); }
  catch { return null; }
}

function qs(query: URLSearchParams, key: string, fallback: string): string {
  return query.get(key) || fallback;
}

function getRealmOrError(query: URLSearchParams, res: ServerResponse): number | null {
  const realm = parseInt(qs(query, "realm", "0"), 10);
  if (isNaN(realm) || realm < 0) { sendError(res, 400, "realm must be a non-negative integer"); return null; }
  return realm;
}

export function handleForecastGet(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = getRealmOrError(query, res);
    if (realm === null) return;
    const compact = qs(query, "compact", "") === "true";
    const category = qs(query, "category", "");
    const cached = loadLatestJson(getDataRoot(), "aggregates", "forecasts", "realm-" + realm);
    const result = (cached as { series?: Record<string, unknown> } | null) || computeForecasts(realm);
    if (!result || !(result as Record<string, unknown>).ok) {
      sendError(res, 500, "forecast failed for realm " + realm);
      return;
    }
    const data = result as { series: Record<string, unknown>; t: string; r: number };
    if (category && data.series[category]) {
      sendSuccess(res, data.series[category], { realm, category, compact });
      return;
    }
    if (category && !data.series[category]) {
      sendError(res, 404, "category '" + category + "' not found");
      return;
    }
    if (compact) {
      const compacted: Record<string, unknown> = {};
      for (const [k, s] of Object.entries(data.series)) {
        const series = s as { fc?: Array<{ t: string; v: number }>; reliability?: number };
        compacted[k] = { v: series.fc?.[0]?.v, r: series.reliability };
      }
      sendSuccess(res, compacted, { realm, compact });
      return;
    }
    sendSuccess(res, data.series, { realm });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "internal error");
  }
}

export function handleForecastCategory(req: IncomingMessage, res: ServerResponse, params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = getRealmOrError(query, res);
    if (realm === null) return;
    const category = params.category;
    if (!category) { sendError(res, 400, "category required"); return; }
    const result = computeForecasts(realm);
    if (!result.ok) { sendError(res, 500, "forecast failed: " + (result.error || "")); return; }
    const series = result.series[category];
    if (!series) { sendError(res, 404, "category '" + category + "' not found"); return; }
    sendSuccess(res, series, { realm, category });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "internal error");
  }
}

export function handleSimulationRun(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, body: unknown, query: URLSearchParams): void {
  try {
    const realm = getRealmOrError(query, res);
    if (realm === null) return;
    const scenario = typeof body === "object" && body ? (body as Record<string, string>).scenario || qs(query, "scenario", "") : qs(query, "scenario", "");
    const magStr = qs(query, "magnitude", "");
    const magnitude = magStr ? parseFloat(magStr) : undefined;
    if (!scenario) { sendError(res, 400, "scenario required"); return; }
    const result = runSimulation(realm, scenario, magnitude);
    if (!result.ok) { sendError(res, 400, result.error || "simulation failed"); return; }
    sendSuccess(res, result, { realm, scenario });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "internal error");
  }
}

export function handleSignalsGet(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = getRealmOrError(query, res);
    if (realm === null) return;
    const compact = qs(query, "compact", "") === "true";
    const cached = loadLatestJson(getDataRoot(), "aggregates", "signals", "realm-" + realm);
    const result = (cached as { signals?: unknown } | null) || generateSignals(realm);
    if (!result || !(result as Record<string, unknown>).ok) {
      sendError(res, 500, "signal generation failed for realm " + realm);
      return;
    }
    const data = result as { signals: Record<string, unknown>[]; t: string; r: number };
    if (compact) {
      sendSuccess(res, data.signals.map((s) => ({ type: s.type, label: s.label, sev: s.severity, conf: s.confidence })), { realm, compact });
      return;
    }
    sendSuccess(res, data.signals, { realm });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "internal error");
  }
}

export function handleCyclesGet(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = getRealmOrError(query, res);
    if (realm === null) return;
    const compact = qs(query, "compact", "") === "true";
    const cached = loadLatestJson(getDataRoot(), "aggregates", "cycles", "realm-" + realm);
    const result = (cached as { current?: unknown } | null) || detectCycle(realm);
    if (!result || !(result as Record<string, unknown>).ok) {
      sendError(res, 500, "cycle detection failed for realm " + realm);
      return;
    }
    const data = result as { current: unknown; history: unknown[]; stability: number; t: string; r: number };
    if (compact) {
      const phase = (data.current as Record<string, unknown>)?.phase;
      sendSuccess(res, { ph: phase, st: data.stability }, { realm, compact });
      return;
    }
    sendSuccess(res, data, { realm });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "internal error");
  }
}

export function handleDependenciesGet(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = getRealmOrError(query, res);
    if (realm === null) return;
    const compact = qs(query, "compact", "") === "true";
    const result = computeDependencies(realm);
    if (!result.ok) { sendError(res, 500, "dependency computation failed for realm " + realm); return; }
    if (compact) {
      sendSuccess(res, { cr: result.criticalResources.length, chains: result.bottleneckChains.slice(0, 3) }, { realm, compact });
      return;
    }
    sendSuccess(res, result, { realm });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "internal error");
  }
}

export function handleSimulationList(req: IncomingMessage, res: ServerResponse): void {
  const cfg = loadConfig();
  const scenarioList = Object.entries(cfg.simulation.scenarios).map(([key, sc]) => ({
    id: key, name: key.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    description: sc.description, category: sc.category,
    shockPct: sc.shockPct, durationDays: sc.durationDays,
  }));
  sendSuccess(res, scenarioList);
}

import { IncomingMessage, ServerResponse } from "http";
import { sendSuccess, sendError, sendJson } from "../middleware.js";
import {
  loadLastDashboardSummaries,
  loadLatestMacroData,
  loadAlertEvents,
  loadSectorIntelligence,
  loadForecastData,
  loadSignalData,
  loadCycleData,
  loadDependencyData,
} from "./publicData.js";
import { getClientIp } from "../rateLimiter.js";

interface WidgetMeta {
  type: string;
  realm: number;
  compact: boolean;
  generatedAt: string;
  _widget: string;
}

function sendWidget(res: ServerResponse, data: unknown, type: string, realm: number, compact: boolean): void {
  const meta: Record<string, unknown> = { type, realm, compact, generatedAt: new Date().toISOString(), _widget: `simcointel-${type}` };
  if (compact && typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    const scores = obj.scores as Record<string, number> | undefined;
    if (scores) {
      sendJson(res, 200, { v: "1.0", t: meta.generatedAt, w: meta._widget, s: { eh: scores.eh, ms: scores.ms, st: scores.st, ip: scores.ip, sr: scores.sr }, r: obj.regime });
      return;
    }
  }
  sendSuccess(res, data, meta);
}

function getRealm(query: URLSearchParams): number {
  return parseInt(query.get("realm") ?? "0");
}

function isCompact(query: URLSearchParams): boolean {
  return query.get("compact") === "true" || query.get("compact") === "1";
}

export function handleWidgetHealth(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = getRealm(query);
    const compact = isCompact(query);
    const data = loadLastDashboardSummaries();
    const realmKey = `realm-${realm}`;
    const entry = (data as Record<string, unknown>)[realmKey];
    if (!entry) return sendError(res, 404, `No data for realm ${realm}`);
    sendWidget(res, entry, "health", realm, compact);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Widget health error");
  }
}

export function handleWidgetRegime(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = getRealm(query);
    const compact = isCompact(query);
    const data = loadLastDashboardSummaries();
    const entry = (data as Record<string, unknown>)[`realm-${realm}`] as { regime?: Record<string, unknown> } | undefined;
    if (!entry?.regime) return sendError(res, 404, `No regime data for realm ${realm}`);

    if (compact) {
      sendJson(res, 200, { v: "1.0", t: new Date().toISOString(), w: "simcointel-regime", reg: entry.regime });
      return;
    }
    sendSuccess(res, entry.regime, { _widget: "simcointel-regime", realm });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Widget regime error");
  }
}

export function handleWidgetAlerts(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = getRealm(query);
    const limit = parseInt(query.get("limit") ?? "5");
    const compact = isCompact(query);
    const data = loadAlertEvents(realm, limit);

    if (compact) {
      const compacted = (data.events as Array<{ ts: string; se: string; ca: string; ti: string; de?: string }>).map((e) => ({
        t: e.ts, s: e.se, c: e.ca, i: e.ti, d: e.de,
      }));
      sendJson(res, 200, { v: "1.0", t: new Date().toISOString(), w: "simcointel-alerts", a: compacted, total: data.total });
      return;
    }
    sendSuccess(res, data, { _widget: "simcointel-alerts", realm });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Widget alerts error");
  }
}

export function handleWidgetMacro(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = getRealm(query);
    const compact = isCompact(query);
    const data = loadLatestMacroData(realm);

    if (compact) {
      const l = data.latest;
      sendJson(res, 200, {
        v: "1.0", t: data.generatedAt, w: "simcointel-macro", r: data.realm,
        cv: l.companiesValue, ac: l.activeCompanies, bs: l.bondsSold, tb: l.totalBuildings,
        cpi: data.latestIndexes?.cpi, inf: data.latestInflation?.cpiRate,
      });
      return;
    }
    sendSuccess(res, data, { _widget: "simcointel-macro", realm });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Widget macro error");
  }
}

export function handleWidgetScores(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = getRealm(query);
    const compact = isCompact(query);
    const data = loadLastDashboardSummaries();
    const entry = (data as Record<string, unknown>)[`realm-${realm}`] as { scores?: Record<string, number>; generatedAt?: string } | undefined;
    if (!entry?.scores) return sendError(res, 404, `No scores for realm ${realm}`);

    if (compact) {
      sendJson(res, 200, {
        v: "1.0", t: entry.generatedAt ?? new Date().toISOString(), w: "simcointel-scores",
        eh: entry.scores.eh, ms: entry.scores.ms, st: entry.scores.st, ip: entry.scores.ip, sr: entry.scores.sr,
      });
      return;
    }
    sendSuccess(res, entry.scores, { _widget: "simcointel-scores", realm });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Widget scores error");
  }
}

export function handleWidgetForecast(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = getRealm(query);
    const compact = isCompact(query);
    const data = loadForecastData(realm) as { series?: Record<string, { fc?: Array<{ t: string; v: number }>; reliability?: number }> } | null;
    if (!data?.series) return sendError(res, 404, "No forecast data for realm " + realm);
    if (compact) {
      const compacted: Record<string, { v: number | undefined; r: number | undefined }> = {};
      for (const [k, s] of Object.entries(data.series)) {
        compacted[k] = { v: s.fc?.[0]?.v, r: s.reliability };
      }
      sendJson(res, 200, { v: "1.0", t: new Date().toISOString(), w: "simcointel-forecast", fc: compacted });
      return;
    }
    sendSuccess(res, data.series, { _widget: "simcointel-forecast", realm });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Widget forecast error");
  }
}

export function handleWidgetSignals(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = getRealm(query);
    const compact = isCompact(query);
    const data = loadSignalData(realm) as { signals?: Array<{ type: string; label: string; severity: string; confidence: number }> } | null;
    if (!data?.signals) return sendError(res, 404, "No signal data for realm " + realm);
    if (compact) {
      sendJson(res, 200, {
        v: "1.0", t: new Date().toISOString(), w: "simcointel-signals",
        sg: data.signals.map((s) => ({ ty: s.type, l: s.label, se: s.severity, c: s.confidence })),
      });
      return;
    }
    sendSuccess(res, data.signals, { _widget: "simcointel-signals", realm });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Widget signals error");
  }
}

export function handleWidgetCycles(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = getRealm(query);
    const compact = isCompact(query);
    const data = loadCycleData(realm) as { current?: { phase: string; confidence: number }; stability?: number; duration?: number; intensity?: number } | null;
    if (!data?.current) return sendError(res, 404, "No cycle data for realm " + realm);
    if (compact) {
      sendJson(res, 200, {
        v: "1.0", t: new Date().toISOString(), w: "simcointel-cycles",
        ph: data.current.phase, co: data.current.confidence, st: data.stability, du: data.duration, in: data.intensity,
      });
      return;
    }
    sendSuccess(res, data, { _widget: "simcointel-cycles", realm });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Widget cycles error");
  }
}

export function handleWidgetDependencies(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = getRealm(query);
    const compact = isCompact(query);
    const data = loadDependencyData(realm) as { criticalResources?: string[]; bottleneckChains?: Array<{ chain: string; pressure: number }>; riskScores?: Record<string, number> } | null;
    if (!data) return sendError(res, 404, "No dependency data for realm " + realm);
    if (compact) {
      sendJson(res, 200, {
        v: "1.0", t: new Date().toISOString(), w: "simcointel-dependencies",
        cr: (data.criticalResources || []).length, bc: (data.bottleneckChains || []).slice(0, 3).map((c) => ({ ch: c.chain, pr: c.pressure })),
      });
      return;
    }
    sendSuccess(res, data, { _widget: "simcointel-dependencies", realm });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Widget dependencies error");
  }
}

export function handleWidgetList(req: IncomingMessage, res: ServerResponse, _params?: Record<string, string>, _body?: unknown, _query?: URLSearchParams): void {
  const widgets = [
    { id: "health", desc: "Economic health summary with scores and regime", url: "/api/public/widget/health?realm=0" },
    { id: "scores", desc: "All five composite scores (compact mode)", url: "/api/public/widget/scores?realm=0&compact=1" },
    { id: "regime", desc: "Current economic regime", url: "/api/public/widget/regime?realm=0" },
    { id: "alerts", desc: "Recent alert events", url: "/api/public/widget/alerts?realm=0&limit=5" },
    { id: "macro", desc: "Latest macro snapshot", url: "/api/public/widget/macro?realm=0&compact=1" },
    { id: "forecast", desc: "Forecast projections per category", url: "/api/public/widget/forecast?realm=0&compact=1" },
    { id: "signals", desc: "Strategic early-warning signals", url: "/api/public/widget/signals?realm=0&compact=1" },
    { id: "cycles", desc: "Market cycle detection", url: "/api/public/widget/cycles?realm=0&compact=1" },
    { id: "dependencies", desc: "Supply chain dependency analysis", url: "/api/public/widget/dependencies?realm=0&compact=1" },
  ];
  sendSuccess(res, { widgets }, {
    embed: "Use GET /api/public/widget/:type?realm=0&compact=true for minimal payloads",
    compact: "Add ?compact=true or ?compact=1 for abbreviated key names",
  });
}

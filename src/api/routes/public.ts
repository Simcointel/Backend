import { IncomingMessage, ServerResponse } from "http";
import { sendSuccess, sendError } from "../middleware.js";
import { loadConfig } from "../../config/index.js";
import {
  loadLastDashboardSummaries,
  loadLastDashboardHealth,
  loadUnifiedFeed,
  loadAlertEvents,
} from "./publicData.js";
import {
  loadLatestMacroData,
  loadMacroHistory,
  loadMacroIndexes,
  loadMacroInflation,
  loadMacroPhases,
} from "./publicData.js";
import {
  loadLatestIntelligence,
  loadCorrelations,
  loadAnomalies,
  loadDivergence,
  loadContagion,
  loadSectorIntelligence,
} from "./publicData.js";
import { getRateLimitStats } from "../rateLimiter.js";

export function handlePublicDashboard(req: IncomingMessage, res: ServerResponse, _params?: Record<string, string>, _body?: unknown, _query?: URLSearchParams): void {
  try {
    const data = loadLastDashboardSummaries();
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to load dashboard");
  }
}

export function handlePublicMacro(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = parseInt(query.get("realm") ?? "0");
    const data = loadLatestMacroData(realm);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to load macro data");
  }
}

export function handlePublicIndexes(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = parseInt(query.get("realm") ?? "0");
    const limit = parseInt(query.get("limit") ?? "30");
    const data = loadMacroIndexes(realm, limit);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to load indexes");
  }
}

export function handlePublicInflation(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = parseInt(query.get("realm") ?? "0");
    const limit = parseInt(query.get("limit") ?? "30");
    const data = loadMacroInflation(realm, limit);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to load inflation");
  }
}

export function handlePublicEvents(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = query.get("realm") ?? "0";
    const severity = query.get("severity") ?? undefined;
    const category = query.get("category") ?? undefined;
    const limit = parseInt(query.get("limit") ?? "50");
    const data = loadUnifiedFeed(parseInt(realm), severity, category, limit);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to load events");
  }
}

export function handlePublicAlerts(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = parseInt(query.get("realm") ?? "0");
    const limit = parseInt(query.get("limit") ?? "20");
    const data = loadAlertEvents(realm, limit);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to load alerts");
  }
}

export function handlePublicSectors(req: IncomingMessage, res: ServerResponse, _params?: Record<string, string>, _body?: unknown, _query?: URLSearchParams): void {
  try {
    const data = loadSectorIntelligence();
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to load sectors");
  }
}

export function handlePublicCorrelations(req: IncomingMessage, res: ServerResponse, _params?: Record<string, string>, _body?: unknown, _query?: URLSearchParams): void {
  try {
    const data = loadCorrelations();
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to load correlations");
  }
}

export function handlePublicStatus(req: IncomingMessage, res: ServerResponse, _params?: Record<string, string>, _body?: unknown, _query?: URLSearchParams): void {
  const cfg = loadConfig();
  sendSuccess(res, {
    api: "SimcoIntel Public API",
    version: cfg.network.apiVersion,
    realms: cfg.simco.realms,
    endpoints: {
      dashboard: "/api/public/dashboard",
      macro: "/api/public/macro?realm=0",
      indexes: "/api/public/indexes?realm=0&limit=30",
      inflation: "/api/public/inflation?realm=0&limit=30",
      events: "/api/public/events?realm=0&limit=50",
      alerts: "/api/public/alerts?realm=0&limit=20",
      sectors: "/api/public/sectors",
      correlations: "/api/public/correlations",
      export: "/api/public/export/:dataset",
    },
    rateLimiting: getRateLimitStats(),
    generatedAt: new Date().toISOString(),
  });
}

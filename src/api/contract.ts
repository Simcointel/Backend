import { ServerResponse } from "http";
import { loadConfig } from "../config/index.js";
import { sendJson } from "./middleware.js";

const API_VERSION = "1.0";

export function apiVersion(): string {
  const cfg = loadConfig();
  return cfg.network.apiVersion || API_VERSION;
}

export function sendVersionedSuccess(res: ServerResponse, data: unknown, meta?: Record<string, unknown>): void {
  sendJson(res, 200, {
    ok: true,
    v: apiVersion(),
    t: new Date().toISOString(),
    data,
    ...(meta ? { meta } : {}),
  });
}

export function sendVersionedError(res: ServerResponse, statusCode: number, error: string, meta?: Record<string, unknown>): void {
  sendJson(res, statusCode, {
    ok: false,
    v: apiVersion(),
    t: new Date().toISOString(),
    error,
    ...(meta ? { meta } : {}),
  });
}

export function getSchema(): Record<string, unknown> {
  return {
    apiVersion: apiVersion(),
    generatedAt: new Date().toISOString(),
    endpoints: [
      { path: "/api/health", method: "GET", description: "Health check", response: "HealthReport" },
      { path: "/api/status", method: "GET", description: "Full status", response: "StatusReport" },
      { path: "/api/config", method: "GET", description: "List config sections", response: "ConfigList" },
      { path: "/api/config/:section", method: "GET", description: "Get config section", response: "ConfigSection" },
      { path: "/api/config/:section", method: "PUT", description: "Update config section", response: "ConfigUpdate" },
      { path: "/api/actions/:action", method: "POST", description: "Execute admin action", response: "AdminResult" },
      { path: "/api/actions/scheduler/:cmd", method: "POST", description: "Scheduler control", response: "SchedulerResult" },
      { path: "/api/snapshots", method: "GET", description: "List snapshots", response: "SnapshotList" },
      { path: "/api/snapshots/:realm", method: "GET", description: "List realm snapshots", response: "RealmSnapshotList" },
      { path: "/api/snapshots/:realm/:file", method: "GET", description: "Get snapshot file", response: "SnapshotFile" },
      { path: "/api/archives", method: "GET", description: "List archives", response: "ArchiveList" },
      { path: "/api/archives/:realm", method: "GET", description: "List realm archives", response: "RealmArchiveList" },
      { path: "/api/macro/history", method: "GET", description: "List macro history overview", response: "MacroHistoryOverview" },
      { path: "/api/macro/realm/:realm/history", method: "GET", description: "Realm macro history", response: "MacroHistory" },
      { path: "/api/macro/indexes/:realm", method: "GET", description: "Realm price indexes", response: "PriceIndexes" },
      { path: "/api/macro/inflation/:realm", method: "GET", description: "Realm inflation reports", response: "InflationReports" },
      { path: "/api/macro/phases/:realm", method: "GET", description: "Realm phase history", response: "PhaseHistory" },
      { path: "/api/macro/latest/:realm", method: "GET", description: "Realm latest data", response: "LatestData" },
      { path: "/api/macro/state/:realm", method: "GET", description: "Realm backfill state", response: "BackfillState" },
      { path: "/api/intelligence/momentum", method: "GET", description: "Market momentum", response: "MomentumData" },
      { path: "/api/intelligence/volatility", method: "GET", description: "Market volatility", response: "VolatilityData" },
      { path: "/api/intelligence/stress", method: "GET", description: "Sector stress", response: "StressData" },
      { path: "/api/intelligence/regimes", method: "GET", description: "Economic regimes", response: "RegimeData" },
      { path: "/api/intelligence/leaders", method: "GET", description: "Commodity leaders", response: "LeadersData" },
      { path: "/api/intelligence/sectors", method: "GET", description: "Sector view", response: "SectorData" },
      { path: "/api/intelligence/correlations", method: "GET", description: "Category correlations", response: "CorrelationData" },
      { path: "/api/intelligence/anomalies", method: "GET", description: "Market anomalies", response: "AnomalyData" },
      { path: "/api/intelligence/divergence", method: "GET", description: "Sector divergences", response: "DivergenceData" },
      { path: "/api/intelligence/contagion", method: "GET", description: "Contagion signals", response: "ContagionData" },
      { path: "/api/intelligence/alerts", method: "GET", description: "Alert events", response: "AlertData" },
      { path: "/api/intelligence/events", method: "GET", description: "Event archives", response: "EventArchives" },
      { path: "/api/dashboard/summary", method: "GET", description: "Stored dashboard summary", response: "DashboardSummary" },
      { path: "/api/dashboard/state", method: "GET", description: "Live dashboard state", response: "DashboardState" },
      { path: "/api/dashboard/health", method: "GET", description: "System health + ops", response: "DashboardHealth" },
      { path: "/api/dashboard/events", method: "GET", description: "Unified event feed", response: "UnifiedFeed" },
      { path: "/api/dashboard/alerts", method: "GET", description: "Dashboard alerts", response: "DashboardAlerts" },
      { path: "/api/dashboard/sectors", method: "GET", description: "Dashboard sectors", response: "DashboardSectors" },
      { path: "/api/dashboard/system", method: "GET", description: "Operational status", response: "OperationalStatus" },
      { path: "/api/realtime/status", method: "GET", description: "Realtime gateway status", response: "RealtimeStatus" },
      { path: "/api/realtime/streams", method: "GET", description: "Available SSE streams", response: "RealtimeStreams" },
      { path: "/api/realtime/schema", method: "GET", description: "API schema documentation", response: "ApiSchema" },
      { path: "/api/realtime/hydration", method: "GET", description: "Frontend hydration payload", response: "HydrationPayload" },
      { path: "/api/realtime/version", method: "GET", description: "API version info", response: "VersionInfo" },
      { path: "/api/sse", method: "GET", description: "Server-Sent Events stream", response: "SSE stream" },
    ],
    responseSchema: {
      ApiResponse: { ok: "boolean", v: "string (API version)", t: "string (ISO timestamp)", data: "T", meta: "object (optional)" },
    },
  };
}

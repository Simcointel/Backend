import { setDefaultResultOrder } from "dns";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { existsSync, mkdirSync } from "fs";
import express, { Express } from "express";
import { logger } from "../logging/logger.js";

try { setDefaultResultOrder("ipv4first"); logger.info("DNS: IPv4-first resolution enabled"); } catch { /* pre-18.13 Node */ }
import { Router } from "./router.js";
import { sendSuccess, sendError, parseJsonBody, requestLogger, enableCors, handleOptions } from "./middleware.js";
import { rateLimitMiddleware } from "./rateLimiter.js";
import { handleHealth } from "./routes/health.js";
import { handleStatus } from "./routes/status.js";
import { handleListConfig, handleGetConfig, handleUpdateConfig } from "./routes/config.js";
import { handleAction, handleSchedulerControl } from "./routes/actions.js";
import { handleListSnapshots, handleListRealmSnapshots, handleGetSnapshot } from "./routes/snapshots.js";
import { handleListArchives, handleListRealmArchives } from "./routes/archives.js";
import {
  handleMacroHistory,
  handleMacroIndexes,
  handleMacroInflation,
  handleMacroPhases,
  handleMacroLatest,
  handleMacroState,
  handleMacroListHistory,
} from "./routes/macro.js";
import {
  handleIntelligenceMomentum,
  handleIntelligenceVolatility,
  handleIntelligenceStress,
  handleIntelligenceRegimes,
  handleIntelligenceLeaders,
  handleIntelligenceSectors,
} from "./routes/intelligence.js";
import {
  handleRelationalCorrelations,
  handleRelationalAnomalies,
  handleRelationalDivergence,
  handleRelationalContagion,
  handleRelationalAlerts,
  handleRelationalEvents,
} from "./routes/relational.js";
import {
  handleDashboardSummary,
  handleDashboardState,
  handleDashboardHealth,
  handleDashboardEvents,
  handleDashboardAlerts,
  handleDashboardSectors,
  handleDashboardSystem,
} from "./routes/dashboard.js";
import {
  handleRealtimeStatus,
  handleRealtimeStreams,
  handleRealtimeSchema,
  handleRealtimeHydration,
  handleRealtimeVersion,
} from "./routes/realtime.js";
import { handleSseConnection, initSseEventBus } from "./sse.js";
import {
  handlePublicDashboard,
  handlePublicMacro,
  handlePublicIndexes,
  handlePublicInflation,
  handlePublicEvents,
  handlePublicAlerts,
  handlePublicSectors,
  handlePublicCorrelations,
  handlePublicStatus,
} from "./routes/public.js";
import {
  handlePublicExport,
  handlePublicExportList,
} from "./routes/publicExport.js";
import { handleSync } from "./routes/sync.js";
import {
  handleWidgetHealth,
  handleWidgetRegime,
  handleWidgetAlerts,
  handleWidgetMacro,
  handleWidgetScores,
  handleWidgetForecast,
  handleWidgetSignals,
  handleWidgetCycles,
  handleWidgetDependencies,
  handleWidgetList,
} from "./routes/widget.js";
import {
  handleForecastGet,
  handleForecastCategory,
  handleSimulationRun,
  handleSignalsGet,
  handleCyclesGet,
  handleDependenciesGet,
  handleSimulationList,
} from "./routes/forecast.js";
import { handleCronCycle } from "./routes/cron.js";
import { startScheduler } from "../jobs/scheduler.js";
import { reloadConfig } from "../config/index.js";
import { getBaseUrl } from "./urlHelper.js";

function buildRouter(): Router {
  const r = new Router();

  r.get("/api/health", handleHealth);
  r.get("/api/status", handleStatus);

  r.get("/api/config", handleListConfig);
  r.get("/api/config/:section", (req, res, params) => handleGetConfig(req, res, params.section));
  r.put("/api/config/:section", (req, res, params) => handleUpdateConfig(req, res, params.section));

  r.post("/api/actions/:action", (req, res, params) => handleAction(req, res, params.action));
  r.post("/api/actions/scheduler/:cmd", (req, res, params) => handleSchedulerControl(req, res, params.cmd));

  r.get("/api/snapshots", handleListSnapshots);
  r.get("/api/snapshots/:realm", (req, res, params) => handleListRealmSnapshots(req, res, params.realm));
  r.get("/api/snapshots/:realm/:file", (req, res, params) => handleGetSnapshot(req, res, params.realm, params.file));

  r.get("/api/archives", handleListArchives);
  r.get("/api/archives/:realm", (req, res, params) => handleListRealmArchives(req, res, params.realm));

  r.get("/api/macro/history", handleMacroListHistory);
  r.get("/api/macro/realm/:realm/history", (req, res, params) => handleMacroHistory(req, res, params.realm));
  r.get("/api/macro/indexes/:realm", (req, res, params) => handleMacroIndexes(req, res, params.realm));
  r.get("/api/macro/inflation/:realm", (req, res, params) => handleMacroInflation(req, res, params.realm));
  r.get("/api/macro/phases/:realm", (req, res, params) => handleMacroPhases(req, res, params.realm));
  r.get("/api/macro/latest/:realm", (req, res, params) => handleMacroLatest(req, res, params.realm));
  r.get("/api/macro/state/:realm", (req, res, params) => handleMacroState(req, res, params.realm));

  r.get("/api/intelligence/momentum", handleIntelligenceMomentum);
  r.get("/api/intelligence/volatility", handleIntelligenceVolatility);
  r.get("/api/intelligence/stress", handleIntelligenceStress);
  r.get("/api/intelligence/regimes", handleIntelligenceRegimes);
  r.get("/api/intelligence/leaders", handleIntelligenceLeaders);
  r.get("/api/intelligence/sectors", handleIntelligenceSectors);

  r.get("/api/intelligence/correlations", handleRelationalCorrelations);
  r.get("/api/intelligence/anomalies", handleRelationalAnomalies);
  r.get("/api/intelligence/divergence", handleRelationalDivergence);
  r.get("/api/intelligence/contagion", handleRelationalContagion);
  r.get("/api/intelligence/alerts", handleRelationalAlerts);
  r.get("/api/intelligence/events", handleRelationalEvents);

  r.get("/api/dashboard/summary", handleDashboardSummary);
  r.get("/api/dashboard/state", handleDashboardState);
  r.get("/api/dashboard/health", handleDashboardHealth);
  r.get("/api/dashboard/events", handleDashboardEvents);
  r.get("/api/dashboard/alerts", handleDashboardAlerts);
  r.get("/api/dashboard/sectors", handleDashboardSectors);
  r.get("/api/dashboard/system", handleDashboardSystem);

  r.get("/api/realtime/status", handleRealtimeStatus);
  r.get("/api/realtime/streams", handleRealtimeStreams);
  r.get("/api/realtime/schema", handleRealtimeSchema);
  r.get("/api/realtime/hydration", handleRealtimeHydration);
  r.get("/api/realtime/version", handleRealtimeVersion);

  r.get("/api/sse", handleSseConnection);

  // Public API (rate limited)
  r.get("/api/public/status", handlePublicStatus);
  r.get("/api/public/dashboard", wrapRateLimited(handlePublicDashboard));
  r.get("/api/public/macro", wrapRateLimited(handlePublicMacro));
  r.get("/api/public/indexes", wrapRateLimited(handlePublicIndexes));
  r.get("/api/public/inflation", wrapRateLimited(handlePublicInflation));
  r.get("/api/public/events", wrapRateLimited(handlePublicEvents));
  r.get("/api/public/alerts", wrapRateLimited(handlePublicAlerts));
  r.get("/api/public/sectors", wrapRateLimited(handlePublicSectors));
  r.get("/api/public/correlations", wrapRateLimited(handlePublicCorrelations));
  r.get("/api/public/export", wrapRateLimited(handlePublicExportList));
  r.get("/api/public/export/:dataset", wrapRateLimited(handlePublicExport));

  // Widget API (rate limited)
  r.get("/api/public/widget", wrapRateLimited(handleWidgetList));
  r.get("/api/public/widget/health", wrapRateLimited(handleWidgetHealth));
  r.get("/api/public/widget/regime", wrapRateLimited(handleWidgetRegime));
  r.get("/api/public/widget/alerts", wrapRateLimited(handleWidgetAlerts));
  r.get("/api/public/widget/macro", wrapRateLimited(handleWidgetMacro));
  r.get("/api/public/widget/scores", wrapRateLimited(handleWidgetScores));
  r.get("/api/public/widget/forecast", wrapRateLimited(handleWidgetForecast));
  r.get("/api/public/widget/signals", wrapRateLimited(handleWidgetSignals));
  r.get("/api/public/widget/cycles", wrapRateLimited(handleWidgetCycles));
  r.get("/api/public/widget/dependencies", wrapRateLimited(handleWidgetDependencies));

  // Forecast API (rate limited + cached)
  r.get("/api/public/forecast", wrapForecastRoute(handleForecastGet, 60));
  r.get("/api/public/forecast/:category", wrapForecastRoute(handleForecastCategory, 60));
  r.get("/api/public/simulation", wrapForecastRoute(handleSimulationList, 60));
  r.post("/api/public/simulation", wrapForecastRoute(handleSimulationRun));
  r.get("/api/public/signals", wrapForecastRoute(handleSignalsGet, 60));
  r.get("/api/public/cycles", wrapForecastRoute(handleCyclesGet, 60));
  r.get("/api/public/dependencies", wrapForecastRoute(handleDependenciesGet, 60));

  // Cron (Vercel Cron Jobs)
  r.post("/api/cron/cycle", handleCronCycle);

  // Sync (for Data repo GitHub Action to pull)
  r.get("/api/public/sync", wrapRateLimited(handleSync));

  return r;
}

function wrapForecastRoute(
  handler: (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: unknown, query: URLSearchParams) => void,
  cacheTTL?: number,
) {
  return (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: unknown) => {
    if (!rateLimitMiddleware(req, res)) return;
    if (cacheTTL) res.setHeader("Cache-Control", "public, max-age=" + cacheTTL);
    const url = req.url || "/";
    const query = new URLSearchParams(url.includes("?") ? url.split("?")[1] : "");
    handler(req, res, params, body, query);
  };
}

function wrapRateLimited(handler: (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: unknown, query: URLSearchParams) => void) {
  return async (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: unknown) => {
    if (!rateLimitMiddleware(req, res)) return;
    const url = req.url || "/";
    const query = new URLSearchParams(url.includes("?") ? url.split("?")[1] : "");
    handler(req, res, params, body, query);
  };
}

function ensureDataDir(): void {
  let dir = process.env.DATA_REPO_PATH;
  if (!dir || dir.includes("://")) {
    dir = "/tmp/data-repo";
  }
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  process.env.DATA_REPO_PATH = dir;
  reloadConfig();
  logger.info(`Data directory ready at ${dir}`);
}

export function createApp(): Express {
  initSseEventBus();
  const app = express();
  const router = buildRouter();

  ensureDataDir();
  startScheduler().catch((err) => {
    logger.error("Scheduler failed to start", err instanceof Error ? err.message : String(err));
  });

  app.use(async (req, res) => {
    requestLogger(req, res);
    enableCors(res);

    if (await handleOptions(req, res)) return;

    const url = req.url || "/";
    const baseUrl = getBaseUrl(req);

    try {
      const match = router.match(req.method || "GET", url, baseUrl);

      if (!match) {
        return sendError(res, 404, `No route: ${req.method} ${new URL(url, baseUrl).pathname}`);
      }

      const method = req.method || "GET";
      if (method === "POST" || method === "PUT") {
        try {
          const body = await parseJsonBody(req);
          await match.handler(req, res, match.params, body);
        } catch {
          await match.handler(req, res, match.params, undefined);
        }
      } else {
        await match.handler(req, res, match.params, undefined);
      }
    } catch (err) {
      logger.error("Unhandled server error", err instanceof Error ? err.message : String(err));
      sendError(res, 500, "Internal server error");
    }
  });

  return app;
}

export function startServer(port: number): void {
  const app = createApp();
  app.listen(port, () => {
    logger.info(`HTTP server listening on port ${port}`);
    logger.info(`  API base: http://localhost:${port}/api`);
  });
}

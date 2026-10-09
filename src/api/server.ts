import { setDefaultResultOrder } from "dns";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { join, resolve, extname, dirname } from "path";
import { fileURLToPath } from "url";
import express, { Express, Request, Response, NextFunction } from "express";
import { logger } from "../logging/logger.js";

try { setDefaultResultOrder("ipv4first"); logger.info("DNS: IPv4-first resolution enabled"); } catch { /* pre-18.13 Node */ }
import { Router } from "./router.js";
import { sendSuccess, sendError, requestLogger } from "./middleware.js";
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
  handlePublicMacro,
  handlePublicIndexes,
  handlePublicInflation,
  handlePublicStatus,
} from "./routes/public.js";
import {
  handlePublicExport,
  handlePublicExportList,
} from "./routes/publicExport.js";
import { handleSync } from "./routes/sync.js";
import { handleCronCycle, handleTriggerFetch } from "./routes/cron.js";
import { startScheduler } from "../jobs/scheduler.js";
import { reloadConfig } from "../config/index.js";
import { getBaseUrl } from "./urlHelper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  // Public API (rate limited)
  r.get("/api/public/status", handlePublicStatus);
  r.get("/api/public/macro", wrapRateLimited(handlePublicMacro));
  r.get("/api/public/indexes", wrapRateLimited(handlePublicIndexes));
  r.get("/api/public/inflation", wrapRateLimited(handlePublicInflation));
  r.get("/api/public/export", wrapRateLimited(handlePublicExportList));
  r.get("/api/public/export/:dataset", wrapRateLimited(handlePublicExport));
  r.get("/api/public/sync", wrapRateLimited(handleSync));

  // Cron (Vercel Cron Jobs)
  r.post("/api/cron/cycle", handleCronCycle);
  r.post("/api/cron/trigger-fetch", handleTriggerFetch);

  // Sync (for Data repo GitHub Action to pull)
  r.get("/api/public/sync", wrapRateLimited(handleSync));

  return r;
}

function wrapRateLimited(handler: (req: Request, res: Response, params: Record<string, string>, body: unknown, query: URLSearchParams) => void) {
  return async (req: Request, res: Response, params: Record<string, string>, body: unknown) => {
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

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

function serveStaticFiles(app: Express, staticDir: string): void {
  // Serve admin dashboard index.html with meta tag injection
  app.get("/admin", (req, res, next) => {
    const indexPath = join(staticDir, "index.html");
    if (existsSync(indexPath)) {
      let html = readFileSync(indexPath, "utf-8");
      // Inject Vercel URL into meta tag
      const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
      html = html.replace(
        '<meta name="api-base-url" content="">',
        `<meta name="api-base-url" content="${vercelUrl}">`
      );
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } else {
      next();
    }
  });

  // Serve other static files (CSS, JS, assets)
  app.use("/admin", (req, res, next) => {
    // Skip index.html since it's handled above
    if (req.path === "/" || req.path === "") {
      return next();
    }
    const filePath = join(staticDir, req.path);
    
    if (existsSync(filePath) && !filePath.endsWith("/")) {
      res.setHeader("Content-Type", getMimeType(filePath));
      res.sendFile(filePath);
    } else {
      // SPA fallback - serve index.html for client-side routing
      const indexPath = join(staticDir, "index.html");
      if (existsSync(indexPath)) {
        let html = readFileSync(indexPath, "utf-8");
        const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
        html = html.replace(
          '<meta name="api-base-url" content="">',
          `<meta name="api-base-url" content="${vercelUrl}">`
        );
        res.setHeader("Content-Type", "text/html");
        res.send(html);
      } else {
        next();
      }
    }
  });
}

export function createApp(): Express {
  const app = express();
  const router = buildRouter();

  ensureDataDir();
  startScheduler().catch((err) => {
    logger.error("Scheduler failed to start", err instanceof Error ? err.message : String(err));
  });

  // Parse JSON bodies for all routes
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`[MIDDLEWARE] express.json() for ${req.method} ${req.url}`);
    next();
  });

  app.use(express.json());

    // Debug: log request body after parsing
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === "POST" || req.method === "PUT") {
        console.log(`[BODY-PARSED] ${req.method} ${req.url} body=`, JSON.stringify(req.body));
      }
      next();
    });

    // Enable CORS for ALL requests (including API routes)
    app.use((req: Request, res: Response, next: NextFunction) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
      res.setHeader("Access-Control-Max-Age", "86400");
      if (req.method === "OPTIONS") {
        return res.sendStatus(204);
      }
      next();
    });

  // Serve admin dashboard from /admin
  // In Vercel, __dirname is the dist folder, admin is at project root
  // Try multiple possible locations
  const possiblePaths = [
    join(__dirname, "..", "..", "admin", "public"),  // Local dev: src/api/ -> project root
    join(__dirname, "..", "admin", "public"),         // Vercel: dist/api/ -> project root
    join(process.cwd(), "admin", "public"),           // Fallback: cwd
  ];

  let adminStaticDir = "";
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      adminStaticDir = p;
      break;
    }
  }

  if (adminStaticDir) {
    serveStaticFiles(app, adminStaticDir);
    logger.info(`Admin static files served from: ${adminStaticDir}`);
  } else {
    logger.warn("Admin static directory not found in any expected location");
  }

  app.use(async (req: Request, res: Response, next: NextFunction) => {
      requestLogger(req, res);
      console.log(`[SERVER] ${req.method} ${req.url}`);

      const url = req.url || "/";
      const baseUrl = getBaseUrl(req);

      try {
        const match = router.match(req.method || "GET", url, baseUrl);

        if (!match) {
          console.log(`[SERVER] No match for ${req.method} ${url}`);
          return sendError(res, 404, `No route: ${req.method} ${new URL(url, baseUrl).pathname}`);
        }

        console.log(`[SERVER] Matched route: ${req.method} ${url} -> handler: ${match.handler.name || 'anonymous'}`);
        const body = req.body;
        console.log(`[SERVER] Body:`, JSON.stringify(body));
        console.log(`[SERVER] Calling handler...`);
        const handlerResult = await match.handler(req, res, match.params, body);
        console.log(`[SERVER] Handler completed, result:`, handlerResult);
      } catch (err) {
        console.error("[SERVER] Unhandled server error:", err);
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
    logger.info(`  Admin UI: http://localhost:${port}/admin`);
  });
}

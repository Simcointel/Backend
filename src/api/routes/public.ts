import { IncomingMessage, ServerResponse } from "http";
import { sendSuccess, sendError } from "../middleware.js";
import { loadConfig } from "../../config/index.js";
import {
  loadLatestMacroData,
  loadMacroHistory,
  loadMacroIndexes,
  loadMacroInflation,
} from "./publicData.js";
import { loadLatestResources } from "../../jobs/resources.js";

/**
 * @swagger
 * tags:
 *   name: Public
 *   description: Public API endpoints (rate limited)
 */

/**
 * @swagger
 * /api/public/macro:
 *   get:
 *     summary: Get latest macro snapshot for a realm
 *     tags: [Public]
 *     parameters:
 *       - in: query
 *         name: realm
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Realm number
 *     responses:
 *       200:
 *         description: Latest macro data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PublicMacro'
 *       500:
 *         description: Failed to load macro data
 */
export function handlePublicMacro(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = parseInt(query.get("realm") ?? "0");
    const data = loadLatestMacroData(realm);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to load macro data");
  }
}

/**
 * @swagger
 * /api/public/indexes:
 *   get:
 *     summary: Get price indexes (CPI, Core CPI, GDP) for a realm
 *     tags: [Public]
 *     parameters:
 *       - in: query
 *         name: realm
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Realm number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Maximum number of entries
 *     responses:
 *       200:
 *         description: Price indexes data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MacroIndexesResponse'
 *       500:
 *         description: Failed to load indexes
 */
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

/**
 * @swagger
 * /api/public/inflation:
 *   get:
 *     summary: Get inflation rates for a realm
 *     tags: [Public]
 *     parameters:
 *       - in: query
 *         name: realm
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Realm number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Maximum number of entries
 *     responses:
 *       200:
 *         description: Inflation data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MacroInflationResponse'
 *       500:
 *         description: Failed to load inflation
 */
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

/**
 * @swagger
 * /api/public/status:
 *   get:
 *     summary: Get public API status and available endpoints
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: API status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PublicStatus'
 */
export function handlePublicStatus(req: IncomingMessage, res: ServerResponse, _params?: Record<string, string>, _body?: unknown, _query?: URLSearchParams): void {
  const cfg = loadConfig();
  sendSuccess(res, {
    api: "SimcoIntel Public API",
    version: "1.0",
    realms: cfg.simco.realms,
    endpoints: {
      macro: "/api/public/macro?realm=0",
      indexes: "/api/public/indexes?realm=0&limit=30",
      inflation: "/api/public/inflation?realm=0&limit=30",
      resources: "/api/public/resources?realm=0",
      export: "/api/public/export/:dataset",
    },
    generatedAt: new Date().toISOString(),
  });
}

/**
 * @swagger
 * /api/public/resources:
 *   get:
 *     summary: Get latest resources/profit margins for a realm
 *     tags: [Public]
 *     parameters:
 *       - in: query
 *         name: realm
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Realm number
 *     responses:
 *       200:
 *         description: Resources/profit margins data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProfitMarginsResponse'
 *       404:
 *         description: No resources data found for realm
 *       500:
 *         description: Failed to load resources
 */
export function handlePublicResources(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = parseInt(query.get("realm") ?? "0");
    const data = loadLatestResources(realm);
    if (!data) {
      sendError(res, 404, `No resources data found for realm ${realm}`);
      return;
    }
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to load resources");
  }
}

/**
 * @swagger
 * /api/public/alerts:
 *   get:
 *     summary: Get alerts for a realm
 *     tags: [Public]
 *     parameters:
 *       - in: query
 *         name: realm
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Realm number
 *     responses:
 *       200:
 *         description: Alerts data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AlertsResponse'
 *       500:
 *         description: Failed to load alerts
 */
export function handlePublicAlerts(req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  try {
    const realm = parseInt(query.get("realm") ?? "0");
    // For now return empty array - future: integrate with backend alert system
    sendSuccess(res, {
      alerts: [] as Array<{ id: string; type: string; title: string; message: string; timestamp: string; realm?: number }>,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to load alerts");
  }
}
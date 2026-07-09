import { IncomingMessage, ServerResponse } from "http";
import { sendSuccess, sendError } from "../middleware.js";
import { loadConfig } from "../../config/index.js";
import {
  loadLatestMacroData,
  loadMacroHistory,
  loadMacroIndexes,
  loadMacroInflation,
} from "./publicData.js";
import { getRateLimitStats } from "../rateLimiter.js";


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
      export: "/api/public/export/:dataset",
    },
    rateLimiting: getRateLimitStats(),
    generatedAt: new Date().toISOString(),
  });
}

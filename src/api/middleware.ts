import { IncomingMessage, ServerResponse } from "http";
import { logger } from "../logging/logger.js";

export function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const API_VERSION = "1.0";

export function sendSuccess(res: ServerResponse, data: unknown, meta?: Record<string, unknown>): void {
  sendJson(res, 200, { ok: true, v: API_VERSION, t: new Date().toISOString(), data, ...(meta ? { meta } : {}) });
}

export function sendError(res: ServerResponse, statusCode: number, error: string): void {
  sendJson(res, statusCode, { ok: false, v: API_VERSION, t: new Date().toISOString(), error });
}

export function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function requestLogger(req: IncomingMessage, res: ServerResponse): void {
  const start = Date.now();
  const originalEnd = res.end.bind(res);
  res.end = ((...args: Parameters<ServerResponse["end"]>) => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.url} → ${res.statusCode} (${duration}ms)`);
    return originalEnd(...args);
  }) as ServerResponse["end"];
}

export function enableCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export async function handleOptions(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

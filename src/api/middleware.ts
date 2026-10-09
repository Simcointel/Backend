import { IncomingMessage, ServerResponse } from "http";
import { Response } from "express";
import { logger } from "../logging/logger.js";

type ResponseLike = ServerResponse | Response;

export function sendJson(res: ResponseLike, statusCode: number, data: unknown): void {
  if ("status" in res && typeof res.status === "function") {
    res.status(statusCode).json(data);
  } else {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }
}

const API_VERSION = "1.0";

export function sendSuccess(res: ResponseLike, data: unknown, meta?: Record<string, unknown>): void {
  sendJson(res, 200, { ok: true, v: API_VERSION, t: new Date().toISOString(), data, ...(meta ? { meta } : {}) });
}

export function sendError(res: ResponseLike, statusCode: number, error: string): void {
  sendJson(res, statusCode, { ok: false, v: API_VERSION, t: new Date().toISOString(), error });
}

export function parseJsonBody(req: IncomingMessage, timeoutMs = 5000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      reject(new Error("Request body parse timeout"));
    }, timeoutMs);

    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      clearTimeout(timeout);
      if (timedOut) return;
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", (err) => {
      clearTimeout(timeout);
      if (!timedOut) reject(err);
    });
  });
}

const originalEndMap = new WeakMap<ServerResponse, ServerResponse["end"]>();

export function requestLogger(req: IncomingMessage, res: ServerResponse): void {
  const start = Date.now();

  // Avoid double-wrapping if middleware runs twice on the same response
  if (originalEndMap.has(res)) return;

  const originalEnd = res.end.bind(res);
  originalEndMap.set(res, originalEnd);

  res.end = ((...args: Parameters<ServerResponse["end"]>) => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.url} → ${res.statusCode} (${duration}ms)`);
    return originalEnd(...args);
  }) as ServerResponse["end"];
}

export function enableCors(res: ResponseLike): void {
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

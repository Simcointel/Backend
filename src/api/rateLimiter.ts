import { IncomingMessage, ServerResponse } from "http";
import { sendError } from "./middleware.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;
const entries = new Map<string, RateLimitEntry>();

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of entries) {
    if (entry.resetAt < now) entries.delete(ip);
  }
}, 60_000);

export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

export function checkRateLimit(req: IncomingMessage): { allowed: boolean; remaining: number; resetAt: number } {
  const ip = getClientIp(req);
  const now = Date.now();
  let entry = entries.get(ip);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    entries.set(ip, entry);
  }

  entry.count++;
  const remaining = Math.max(0, MAX_REQUESTS - entry.count);

  if (entry.count > MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining, resetAt: entry.resetAt };
}

export function rateLimitMiddleware(req: IncomingMessage, res: ServerResponse): boolean {
  const check = checkRateLimit(req);
  res.setHeader("X-RateLimit-Limit", String(MAX_REQUESTS));
  res.setHeader("X-RateLimit-Remaining", String(check.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(check.resetAt / 1000)));

  if (!check.allowed) {
    sendError(res, 429, "Rate limit exceeded. Max 120 requests per minute per IP.");
    return false;
  }
  return true;
}

export function getRateLimitStats(): { activeEntries: number; maxPerWindow: number; windowMs: number } {
  return { activeEntries: entries.size, maxPerWindow: MAX_REQUESTS, windowMs: WINDOW_MS };
}

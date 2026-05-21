import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, getClientIp, getRateLimitStats } from "../../api/rateLimiter.js";
import { IncomingMessage } from "http";

function makeReq(ip: string, forwarded?: string): IncomingMessage {
  const headers: Record<string, string> = {};
  if (forwarded) headers["x-forwarded-for"] = forwarded;
  return {
    headers,
    socket: { remoteAddress: ip },
  } as unknown as IncomingMessage;
}

describe("rateLimiter", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("getClientIp", () => {
    it("extracts IP from x-forwarded-for", () => {
      const req = makeReq("::1", "203.0.113.42, 10.0.0.1");
      expect(getClientIp(req)).toBe("203.0.113.42");
    });

    it("falls back to remoteAddress", () => {
      const req = makeReq("192.168.1.1");
      expect(getClientIp(req)).toBe("192.168.1.1");
    });

    it("handles missing IP", () => {
      const req = { headers: {}, socket: {} } as unknown as IncomingMessage;
      expect(getClientIp(req)).toBe("unknown");
    });
  });

  describe("checkRateLimit", () => {
    it("allows first request", () => {
      const req = makeReq("10.0.0.1");
      const result = checkRateLimit(req);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(119);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it("decrements remaining on each request", () => {
      const req = makeReq("10.0.0.2");
      for (let i = 0; i < 5; i++) checkRateLimit(req);
      const result = checkRateLimit(req);
      expect(result.remaining).toBe(114);
    });

    it("blocks after 120 requests", () => {
      const req = makeReq("10.0.0.3");
      for (let i = 0; i < 121; i++) checkRateLimit(req);
      const result = checkRateLimit(req);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("treats different IPs independently", () => {
      const req1 = makeReq("10.0.0.4");
      const req2 = makeReq("10.0.0.5");
      for (let i = 0; i < 50; i++) checkRateLimit(req1);
      expect(checkRateLimit(req2).remaining).toBe(119);
    });
  });

  describe("getRateLimitStats", () => {
    it("returns configuration info", () => {
      const stats = getRateLimitStats();
      expect(stats.maxPerWindow).toBe(120);
      expect(stats.windowMs).toBe(60000);
      expect(typeof stats.activeEntries).toBe("number");
    });
  });
});

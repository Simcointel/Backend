import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "http";
import { isAdminAuthorized } from "../../api/middleware.js";
import { handleGetConfig } from "../../api/routes/config.js";

const req = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {} } as IncomingMessage);

const fakeRes = () => {
  const res = {
    statusCode: 0,
    body: "",
    writeHead(code: number) { res.statusCode = code; },
    end(body: string) { res.body = body; },
  };
  return res as unknown as ServerResponse & typeof res;
};

const snapshotEnv = () => ({
  nodeEnv: process.env.NODE_ENV,
  admin: process.env.ADMIN_SECRET,
  cron: process.env.CRON_SECRET,
});

const restore = (orig: ReturnType<typeof snapshotEnv>) => {
  if (orig.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = orig.nodeEnv;
  if (orig.admin === undefined) delete process.env.ADMIN_SECRET;
  else process.env.ADMIN_SECRET = orig.admin;
  if (orig.cron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = orig.cron;
};

describe("admin route auth", () => {
  const orig = snapshotEnv();

  beforeEach(() => {
    delete process.env.ADMIN_SECRET;
    delete process.env.CRON_SECRET;
  });

  afterEach(() => restore(orig));

  it("allows requests outside production when no secret is configured", () => {
    process.env.NODE_ENV = "development";
    expect(isAdminAuthorized(req())).toBe(true);
  });

  it("fails closed in production when no secret is configured", () => {
    process.env.NODE_ENV = "production";
    expect(isAdminAuthorized(req())).toBe(false);
  });

  it("accepts the configured secret with either bearer casing", () => {
    process.env.ADMIN_SECRET = "s3cret";
    process.env.NODE_ENV = "production";
    expect(isAdminAuthorized(req("Bearer s3cret"))).toBe(true);
    expect(isAdminAuthorized(req("bearer s3cret"))).toBe(true);
  });

  it("rejects missing, malformed, or wrong secrets", () => {
    process.env.ADMIN_SECRET = "s3cret";
    expect(isAdminAuthorized(req())).toBe(false);
    expect(isAdminAuthorized(req("Basic s3cret"))).toBe(false);
    expect(isAdminAuthorized(req("Bearer wrong"))).toBe(false);
  });

  it("falls back to CRON_SECRET", () => {
    process.env.CRON_SECRET = "cron";
    expect(isAdminAuthorized(req("Bearer cron"))).toBe(true);
  });
});

describe("config read whitelist", () => {
  it("does not expose dataRepo (which holds the GitHub token)", async () => {
    const res = fakeRes();
    await handleGetConfig({} as IncomingMessage, res, "dataRepo");
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain("githubToken");
  });
});

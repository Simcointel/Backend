import { describe, it, expect } from "vitest";
import { checkRateLimit } from "../../api/rateLimiter.js";

describe("public API contract", () => {
  it("rateLimiter exports the expected functions", () => {
    expect(typeof checkRateLimit).toBe("function");
  });

  it("middleware sends correct response shape on success", async () => {
    const { sendSuccess, sendError } = await import("../../api/middleware.js");
    let written = "";
    const mockRes = {
      statusCode: 0,
      headers: {} as Record<string, string>,
      writeHead(code: number, headers: Record<string, string>) { this.statusCode = code; this.headers = headers; return this; },
      end(data: string) { written = data; },
    } as any;

    sendSuccess(mockRes, { foo: "bar" }, { meta: "data" });
    const parsed = JSON.parse(written);
    expect(parsed.ok).toBe(true);
    expect(parsed.v).toBe("1.0");
    expect(parsed.t).toBeDefined();
    expect(parsed.data.foo).toBe("bar");
    expect(parsed.meta.meta).toBe("data");
  });

  it("sendError returns correct error shape", async () => {
    const { sendError } = await import("../../api/middleware.js");
    let status = 0;
    let written = "";
    const mockRes = {
      writeHead(code: number) { status = code; return this; },
      end(data: string) { written = data; },
    } as any;

    sendError(mockRes, 404, "Not found");
    const parsed = JSON.parse(written);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("Not found");
    expect(status).toBe(404);
  });
});

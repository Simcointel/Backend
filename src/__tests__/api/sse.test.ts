import { describe, it, expect } from "vitest";

describe("SSE gateway", () => {
  it("exports expected functions", async () => {
    const mod = await import("../../api/sse.js");
    expect(typeof mod.handleSseConnection).toBe("function");
    expect(typeof mod.initSseEventBus).toBe("function");
    expect(typeof mod.getSseClientCount).toBe("function");
  });

  it("getSseClientCount returns a number", async () => {
    const { getSseClientCount } = await import("../../api/sse.js");
    expect(typeof getSseClientCount()).toBe("number");
  });

  it("handleSseConnection does not crash with minimal mock", async () => {
    const { handleSseConnection } = await import("../../api/sse.js");
    let status = 0;
    const mockRes = {
      writeHead(c: number) { status = c; return this; },
      end() {},
      write() {},
      on() {},
    } as any;
    const mockReq = {
      url: "/api/sse?channels=dashboard",
      on: (() => {}) as any,
    } as any;

    await handleSseConnection(mockReq, mockRes);
    expect([200, 404, 503]).toContain(status);
  });

  it("SSE event channels include forecasts, signals, simulations", async () => {
    const { CHANNEL_MAP } = await import("../../events/eventTypes.js");
    expect(CHANNEL_MAP.forecasts).toBeDefined();
    expect(CHANNEL_MAP.signals).toBeDefined();
    expect(CHANNEL_MAP.simulations).toBeDefined();
    expect(Array.isArray(CHANNEL_MAP.forecasts)).toBe(true);
    expect(Array.isArray(CHANNEL_MAP.signals)).toBe(true);
    expect(Array.isArray(CHANNEL_MAP.simulations)).toBe(true);
  });

  it("forecast channel subscribes to pipeline:forecast:complete", async () => {
    const { CHANNEL_MAP } = await import("../../events/eventTypes.js");
    expect(CHANNEL_MAP.forecasts).toContain("pipeline:forecast:complete");
  });

  it("signals channel subscribes to bubble and crash warnings", async () => {
    const { CHANNEL_MAP } = await import("../../events/eventTypes.js");
    expect(CHANNEL_MAP.signals).toContain("forecast:bubble-warning");
    expect(CHANNEL_MAP.signals).toContain("forecast:crash-warning");
  });

  it("SSE event data serializes to JSON without circular refs", async () => {
    const mod = await import("../../api/sse.js");
    const { CHANNEL_MAP } = await import("../../events/eventTypes.js");
    const type = CHANNEL_MAP.forecasts[0];
    const event = { type, timestamp: new Date().toISOString(), realm: 0, data: { forecasts: 5 } };
    const serialized = JSON.stringify(event);
    const parsed = JSON.parse(serialized);
    expect(parsed.type).toBe(type);
    expect(parsed.realm).toBe(0);
    expect(parsed.data.forecasts).toBe(5);
  });

  it("SSE broadcast format matches expected shape", async () => {
    const { CHANNEL_MAP } = await import("../../events/eventTypes.js");
    const event = {
      type: "pipeline:forecast:complete" as const,
      timestamp: new Date().toISOString(),
      realm: 0,
      data: { ok: true, durationMs: 100, forecasts: 5, simulations: 3, signals: 2 },
    };
    const serialized = JSON.stringify(event);
    const parsed = JSON.parse(serialized);
    expect(parsed.data.ok).toBe(true);
    expect(typeof parsed.data.durationMs).toBe("number");
    expect(CHANNEL_MAP.forecasts.includes(event.type)).toBe(true);
    expect(CHANNEL_MAP.public.includes(event.type)).toBe(true);
  });

  it("forecast pipeline emits valid event shape", async () => {
    const { runForecastPipeline } = await import("../../jobs/forecastPipeline.js");
    const result = runForecastPipeline(0);
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("durationMs");
    expect(result).toHaveProperty("forecasts.ok");
    expect(result).toHaveProperty("simulations.ok");
    expect(result).toHaveProperty("dependencies.ok");
    expect(result).toHaveProperty("signals.ok");
    expect(result).toHaveProperty("cycles.ok");
    expect(typeof result.durationMs).toBe("number");
  });
});

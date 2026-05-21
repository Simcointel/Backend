import { describe, it, expect } from "vitest";

describe("forecast API handlers", () => {
  it("exported functions exist", async () => {
    const mod = await import("../../api/routes/forecast.js");
    expect(typeof mod.handleForecastGet).toBe("function");
    expect(typeof mod.handleForecastCategory).toBe("function");
    expect(typeof mod.handleSimulationRun).toBe("function");
    expect(typeof mod.handleSimulationList).toBe("function");
    expect(typeof mod.handleSignalsGet).toBe("function");
    expect(typeof mod.handleCyclesGet).toBe("function");
    expect(typeof mod.handleDependenciesGet).toBe("function");
  });

  it("handleSimulationList returns scenario list with correct shape", async () => {
    const { handleSimulationList } = await import("../../api/routes/forecast.js");
    let status = 0;
    let written = "";
    const mockRes = {
      writeHead(c: number, h: Record<string, string>) { status = c; return this; },
      end(d: string) { written = d; },
      setHeader() {},
    } as any;
    handleSimulationList({} as any, mockRes);
    const parsed = JSON.parse(written);
    expect(parsed.ok).toBe(true);
    expect(parsed.v).toBe("1.0");
    expect(typeof parsed.t).toBe("string");
    expect(Array.isArray(parsed.data)).toBe(true);
    for (const sc of parsed.data) {
      expect(typeof sc.id).toBe("string");
      expect(typeof sc.name).toBe("string");
      expect(typeof sc.description).toBe("string");
      expect(typeof sc.category).toBe("string");
    }
  });

  it("handleForecastGet returns 400 for invalid realm", async () => {
    const { handleForecastGet } = await import("../../api/routes/forecast.js");
    let status = 0;
    let written = "";
    const mockRes = {
      writeHead(c: number, h: Record<string, string>) { status = c; return this; },
      end(d: string) { written = d; },
      setHeader() {},
    } as any;
    const q = new URLSearchParams("realm=-1");
    handleForecastGet({ url: "/api/public/forecast?realm=-1" } as any, mockRes, {}, undefined, q);
    const parsed = JSON.parse(written);
    expect(status).toBe(400);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("realm");
  });

  it("handleForecastCategory returns 400 for missing category", async () => {
    const { handleForecastCategory } = await import("../../api/routes/forecast.js");
    let status = 0;
    let written = "";
    const mockRes = {
      writeHead(c: number, h: Record<string, string>) { status = c; return this; },
      end(d: string) { written = d; },
      setHeader() {},
    } as any;
    const q = new URLSearchParams("realm=0");
    handleForecastCategory({ url: "/api/public/forecast/" } as any, mockRes, {}, undefined, q);
    const parsed = JSON.parse(written);
    expect(status).toBe(400);
    expect(parsed.ok).toBe(false);
  });

  it("handleSimulationRun returns 400 for missing scenario", async () => {
    const { handleSimulationRun } = await import("../../api/routes/forecast.js");
    let status = 0;
    let written = "";
    const mockRes = {
      writeHead(c: number, h: Record<string, string>) { status = c; return this; },
      end(d: string) { written = d; },
      setHeader() {},
    } as any;
    const q = new URLSearchParams("realm=0");
    handleSimulationRun({ url: "/api/public/simulation" } as any, mockRes, {}, undefined, q);
    const parsed = JSON.parse(written);
    expect(status).toBe(400);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("scenario");
  });

  it("all handlers return ok false on error without crash", async () => {
    const { handleForecastGet } = await import("../../api/routes/forecast.js");
    let status = 0;
    let written = "";
    const mockRes = {
      writeHead(c: number, h: Record<string, string>) { status = c; return this; },
      end(d: string) { written = d; },
      setHeader() {},
    } as any;
    handleForecastGet({} as any, mockRes, {}, undefined, undefined as unknown as URLSearchParams);
    const parsed = JSON.parse(written);
    expect(parsed.ok).toBe(false);
  });

  it("forecast widget handlers exist", async () => {
    const mod = await import("../../api/routes/widget.js");
    expect(typeof mod.handleWidgetForecast).toBe("function");
    expect(typeof mod.handleWidgetSignals).toBe("function");
    expect(typeof mod.handleWidgetCycles).toBe("function");
    expect(typeof mod.handleWidgetDependencies).toBe("function");
  });

  it("widget list includes new forecast widgets", async () => {
    const { handleWidgetList } = await import("../../api/routes/widget.js");
    let written = "";
    const mockRes = {
      writeHead() { return this; },
      end(d: string) { written = d; },
      setHeader() {},
    } as any;
    handleWidgetList({} as any, mockRes);
    const parsed = JSON.parse(written);
    expect(parsed.ok).toBe(true);
    const ids = parsed.data.widgets.map((w: { id: string }) => w.id);
    expect(ids).toContain("forecast");
    expect(ids).toContain("signals");
    expect(ids).toContain("cycles");
    expect(ids).toContain("dependencies");
  });

  it("public export datasets include new forecast datasets", async () => {
    const { handlePublicExportList } = await import("../../api/routes/publicExport.js");
    let written = "";
    const mockRes = {
      writeHead() { return this; },
      end(d: string) { written = d; },
      setHeader() {},
    } as any;
    handlePublicExportList({} as any, mockRes);
    const parsed = JSON.parse(written);
    expect(parsed.ok).toBe(true);
    const names = parsed.data.datasets.map((d: { name: string }) => d.name);
    expect(names).toContain("forecasts");
    expect(names).toContain("simulations");
    expect(names).toContain("signals");
    expect(names).toContain("cycles");
    expect(names).toContain("dependencies");
  });
});

import { describe, it, expect } from "vitest";

describe("widget API handlers", () => {
  it("exported functions exist", async () => {
    const mod = await import("../../api/routes/widget.js");
    expect(typeof mod.handleWidgetHealth).toBe("function");
    expect(typeof mod.handleWidgetRegime).toBe("function");
    expect(typeof mod.handleWidgetAlerts).toBe("function");
    expect(typeof mod.handleWidgetMacro).toBe("function");
    expect(typeof mod.handleWidgetScores).toBe("function");
    expect(typeof mod.handleWidgetList).toBe("function");
  });

  it("widget list returns expected shape", async () => {
    const { handleWidgetList } = await import("../../api/routes/widget.js");
    let written = "";
    const mockRes = {
      writeHead(code: number, h: Record<string, string>) { return this; },
      end(d: string) { written = d; },
      setHeader(k: string, v: string) {},
    } as any;
    handleWidgetList({} as any, mockRes);
    const parsed = JSON.parse(written);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.widgets.length).toBe(9);
    const ids = parsed.data.widgets.map((w: { id: string }) => w.id);
    expect(ids).toContain("health");
    expect(ids).toContain("scores");
    expect(ids).toContain("forecast");
    expect(ids).toContain("signals");
    expect(ids).toContain("cycles");
    expect(ids).toContain("dependencies");
  });
});

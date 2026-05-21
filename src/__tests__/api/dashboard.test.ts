import { describe, it, expect } from "vitest";

describe("dashboard API handlers", () => {
  it("all handlers are exported", async () => {
    const mod = await import("../../api/routes/dashboard.js");
    expect(typeof mod.handleDashboardSummary).toBe("function");
    expect(typeof mod.handleDashboardState).toBe("function");
    expect(typeof mod.handleDashboardHealth).toBe("function");
    expect(typeof mod.handleDashboardEvents).toBe("function");
    expect(typeof mod.handleDashboardAlerts).toBe("function");
    expect(typeof mod.handleDashboardSectors).toBe("function");
    expect(typeof mod.handleDashboardSystem).toBe("function");
  });
});

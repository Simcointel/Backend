import { describe, it, expect } from "vitest";
import { generateHealthReport } from "../../health/health.js";

describe("health API", () => {
  it("handleHealth is exported", async () => {
    const mod = await import("../../api/routes/health.js");
    expect(typeof mod.handleHealth).toBe("function");
  });

  it("generateHealthReport returns a report object", async () => {
    const report = await generateHealthReport();
    expect(report).toBeDefined();
    expect(typeof report).toBe("object");
  });
});

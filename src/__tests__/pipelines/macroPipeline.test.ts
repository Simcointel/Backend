import { describe, it, expect } from "vitest";

describe("macroPipeline", () => {
  it("returns a valid result structure", async () => {
    const { runMacroPipeline } = await import("../../jobs/macroPipeline.js");
    const result = await runMacroPipeline();
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("realmMetrics");
    expect(result).toHaveProperty("priceIndexes");
    expect(result).toHaveProperty("inflation");
    expect(result).toHaveProperty("historySync");
    expect(typeof result.durationsMs.total).toBe("number");
  });

  it("durations are non-negative", async () => {
    const { runMacroPipeline } = await import("../../jobs/macroPipeline.js");
    const result = await runMacroPipeline();
    for (const [key, val] of Object.entries(result.durationsMs)) {
      expect(val).toBeGreaterThanOrEqual(0);
    }
  });
});

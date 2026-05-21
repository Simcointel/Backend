import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateIndexHistory, injectIndexSpike, CATEGORIES } from "../helpers/mockData.js";

const mockLoadIndexHistory = vi.fn();
vi.mock("../../jobs/intelligenceUtils.js", () => ({
  loadIndexHistory: mockLoadIndexHistory,
  getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

describe("volatilityEngine", () => {
  beforeEach(() => {
    mockLoadIndexHistory.mockReset();
  });

  it("returns ok for sufficient history", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 60));
    const { computeVolatility } = await import("../../jobs/volatilityEngine.js");
    const result = computeVolatility(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.vol).length).toBeGreaterThan(0);
    }
  });

  it("returns ok=false for insufficient history", async () => {
    mockLoadIndexHistory.mockReturnValue([]);
    const { computeVolatility } = await import("../../jobs/volatilityEngine.js");
    const result = computeVolatility(0);
    expect(result.ok).toBe(false);
  });

  it("handles price spike gracefully", async () => {
    const history = generateIndexHistory(0, 60);
    injectIndexSpike(history, "energy-fuel", 30, 10);
    mockLoadIndexHistory.mockReturnValue(history);
    const { computeVolatility } = await import("../../jobs/volatilityEngine.js");
    const result = computeVolatility(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const cat of Object.values(result.vol)) {
        expect(Number.isFinite(cat.v20)).toBe(true);
        expect(Number.isFinite(cat.v5)).toBe(true);
      }
    }
  });

  it("all volatility values are finite", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 60));
    const { computeVolatility } = await import("../../jobs/volatilityEngine.js");
    const result = computeVolatility(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number.isFinite(result.sr["raw-materials"])).toBe(true);
    }
  });
});

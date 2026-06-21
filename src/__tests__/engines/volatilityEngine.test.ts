import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateIndexHistory, CATEGORIES } from "../helpers/mockData.js";

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
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 30));
    const { computeVolatility } = await import("../../jobs/volatilityEngine.js");
    const result = computeVolatility(0, true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.vol).length).toBeGreaterThan(0);
    }
  });

  it("returns ok=false for insufficient history", async () => {
    mockLoadIndexHistory.mockReturnValue([]);
    const { computeVolatility } = await import("../../jobs/volatilityEngine.js");
    const result = computeVolatility(0, true);
    expect(result.ok).toBe(false);
  });

  it("handles price spike gracefully", async () => {
    const history = generateIndexHistory(0, 30);
    // Inject a spike in one category
    const cat = CATEGORIES[0];
    if (history[20] && history[20].ix[cat]) {
        history[20].ix[cat]!.v *= 10;
    }
    mockLoadIndexHistory.mockReturnValue(history);
    const { computeVolatility } = await import("../../jobs/volatilityEngine.js");
    const result = computeVolatility(0, true);
    expect(result.ok).toBe(true);
  });

  it("all volatility values are finite", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 40));
    const { computeVolatility } = await import("../../jobs/volatilityEngine.js");
    const result = computeVolatility(0, true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const v of Object.values(result.vol)) {
        expect(Number.isFinite(v.v5)).toBe(true);
        expect(Number.isFinite(v.v20)).toBe(true);
      }
    }
  });
});

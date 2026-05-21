import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateIndexHistory, makeMinimalMomentumResult, makeMinimalVolatilityResult, makeMinimalStressResult, CATEGORIES } from "../helpers/mockData.js";

const mockLoadIndexHistory = vi.fn();
const mockLoadRealmHistory = vi.fn(() => []);
vi.mock("../../jobs/intelligenceUtils.js", () => ({
  loadIndexHistory: mockLoadIndexHistory,
  loadRealmHistory: mockLoadRealmHistory,
  getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

vi.mock("../../config/index.js", () => ({
  loadConfig: () => ({
    simco: { realms: [0] },
    intelligence: { regimeLookbackDays: 30, regimeUseStress: true, mediumTermPeriods: 20, shortTermPeriods: 5 },
    macroIndexes: { categories: Object.fromEntries(CATEGORIES.map((c) => [c, {}])) },
  }),
}));

describe("regimeEngine", () => {
  beforeEach(() => {
    mockLoadIndexHistory.mockReset();
  });

  it("classifies data with provided results", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 60));
    const momentum = makeMinimalMomentumResult(0);
    const volatility = makeMinimalVolatilityResult(0);
    const stress = makeMinimalStressResult(0);
    const { computeRegime } = await import("../../jobs/regimeEngine.js");
    const result = computeRegime(0, momentum, volatility, stress);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.cr).toBe("string");
      expect(result.rc).toBeGreaterThanOrEqual(0);
      expect(result.rc).toBeLessThanOrEqual(100);
    }
  });

  it("all numeric outputs are finite", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 60));
    const momentum = makeMinimalMomentumResult(0);
    const volatility = makeMinimalVolatilityResult(0);
    const stress = makeMinimalStressResult(0);
    const { computeRegime } = await import("../../jobs/regimeEngine.js");
    const result = computeRegime(0, momentum, volatility, stress);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number.isFinite(result.rc)).toBe(true);
      expect(Number.isFinite(result.rf.cvGrowth)).toBe(true);
      expect(Number.isFinite(result.rf.avgVolatility)).toBe(true);
      expect(Number.isFinite(result.rf.avgStress)).toBe(true);
    }
  });

  it("returns ok with pre-computed results", async () => {
    mockLoadIndexHistory.mockReturnValue([]);
    const momentum = makeMinimalMomentumResult(0);
    const volatility = makeMinimalVolatilityResult(0);
    const stress = makeMinimalStressResult(0);
    const { computeRegime } = await import("../../jobs/regimeEngine.js");
    const result = computeRegime(0, momentum, volatility, stress);
    expect(result.ok).toBe(true);
  });
});

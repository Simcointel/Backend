import { describe, it, expect, vi } from "vitest";
import { makeMinimalMomentumResult, makeMinimalVolatilityResult, CATEGORIES } from "../helpers/mockData.js";

vi.mock("../../jobs/intelligenceUtils.js", () => ({
  getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
  getDataRoot: vi.fn(() => "/tmp/test"),
  loadIndexHistory: vi.fn(() => []),
}));

vi.mock("../../config/index.js", () => ({
  loadConfig: () => ({
    intelligence: {
      enableLeaders: true, shortTermPeriods: 5, mediumTermPeriods: 20,
      volatilityShortPeriods: 5, volatilityLongPeriods: 20,
      regimeLookbackDays: 30,
    },
    macroIndexes: { categories: Object.fromEntries(CATEGORIES.map((c) => [c, {}])) },
  }),
}));

describe("commodityIntelligence", () => {
  describe("computeLeaders", () => {
    it("identifies top and bottom performers", async () => {
      const momentum = makeMinimalMomentumResult(0);
      const volatility = makeMinimalVolatilityResult(0);
      const { computeLeaders } = await import("../../jobs/commodityIntelligence.js");
      const result = computeLeaders(0, momentum, volatility);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.isArray(result.st)).toBe(true);
        expect(Array.isArray(result.wk)).toBe(true);
      }
    });

    it("leaders and laggards are mutually exclusive", async () => {
      const momentum = makeMinimalMomentumResult(0);
      const volatility = makeMinimalVolatilityResult(0);
      const { computeLeaders } = await import("../../jobs/commodityIntelligence.js");
      const result = computeLeaders(0, momentum, volatility);
      expect(result.ok).toBe(true);
      if (result.ok && result.lw.length > 0 && result.ll.length > 0) {
        const leaderNames = new Set(result.lw.map((l) => l.c));
        const laggardNames = new Set(result.ll.map((l) => l.c));
        for (const name of leaderNames) expect(laggardNames.has(name)).toBe(false);
      }
    });
  });

  describe("computeSectors", () => {
    it("produces sector views", async () => {
      const momentum = makeMinimalMomentumResult(0);
      const volatility = makeMinimalVolatilityResult(0);
      const { computeSectors } = await import("../../jobs/commodityIntelligence.js");
      const result = computeSectors(0, momentum, volatility);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const keys = Object.keys(result.sectors);
        expect(keys.length).toBeGreaterThan(0);
      }
    });

    it("all sector values are finite", async () => {
      const momentum = makeMinimalMomentumResult(0);
      const volatility = makeMinimalVolatilityResult(0);
      const { computeSectors } = await import("../../jobs/commodityIntelligence.js");
      const result = computeSectors(0, momentum, volatility);
      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const sv of Object.values(result.sectors)) {
          expect(Number.isFinite(sv.momentum.st)).toBe(true);
          expect(Number.isFinite(sv.volatility.v5)).toBe(true);
        }
      }
    });
  });
});

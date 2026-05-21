import { describe, it, expect, vi, beforeEach } from "vitest";
import { CATEGORIES } from "../helpers/mockData.js";

const mockLoadCategoryIndexHistory = vi.fn();
vi.mock("../../jobs/relationalUtils.js", () => ({
  loadCategoryIndexHistory: mockLoadCategoryIndexHistory,
  getCategories: vi.fn(() => CATEGORIES),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

vi.mock("../../jobs/intelligenceUtils.js", () => ({
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

vi.mock("../../config/index.js", () => ({
  loadConfig: () => ({
    relational: { correlationWindow: 20, correlationMinPoints: 3 },
  }),
}));

function makeCategoryHistory(days: number) {
  return Array.from({ length: days }, (_, d) => ({
    ts: new Date(2024, 0, 1 + d).toISOString(),
    values: Object.fromEntries(CATEGORIES.map((cat) => [cat, 100 + Math.sin(d * 0.1) * 20 + d * 0.5])),
  }));
}

describe("correlationEngine", () => {
  beforeEach(() => {
    mockLoadCategoryIndexHistory.mockReset();
  });

  it("computes correlation matrix", async () => {
    mockLoadCategoryIndexHistory.mockReturnValue(makeCategoryHistory(60));
    const { computeCorrelations } = await import("../../jobs/correlationEngine.js");
    const result = computeCorrelations(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.m).length).toBeGreaterThan(0);
    }
  });

  it("handles insufficient history", async () => {
    mockLoadCategoryIndexHistory.mockReturnValue([]);
    const { computeCorrelations } = await import("../../jobs/correlationEngine.js");
    const result = computeCorrelations(0);
    expect(result.ok).toBe(false);
  });

  it("all correlation coefficients are in [-1, 1]", async () => {
    mockLoadCategoryIndexHistory.mockReturnValue(makeCategoryHistory(60));
    const { computeCorrelations } = await import("../../jobs/correlationEngine.js");
    const result = computeCorrelations(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const pairs of Object.values(result.m)) {
        for (const pair of Object.values(pairs)) {
          expect(pair.r).toBeGreaterThanOrEqual(-1);
          expect(pair.r).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

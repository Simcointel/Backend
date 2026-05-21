import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateIndexHistory, injectIndexSpike, CATEGORIES } from "../helpers/mockData.js";

const mockLoadIndexHistory = vi.fn();
vi.mock("../../jobs/intelligenceUtils.js", () => ({
  loadIndexHistory: mockLoadIndexHistory,
  getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

const LARGE_DAYS = 365 * 2;
const ITERATIONS = 3;

describe("engine performance benchmarks", () => {
  beforeEach(() => {
    mockLoadIndexHistory.mockReset();
  });

  it("momentum completes within 200ms for 2yr data", async () => {
    const history = generateIndexHistory(0, LARGE_DAYS);
    injectIndexSpike(history, "energy-fuel", 300, 10);
    mockLoadIndexHistory.mockReturnValue(history);
    const { computeMomentum } = await import("../../jobs/momentumEngine.js");
    let total = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      const result = computeMomentum(0);
      total += performance.now() - start;
      expect(result.ok).toBe(true);
    }
    expect(total / ITERATIONS).toBeLessThan(200);
  });

  it("volatility completes within 200ms for 2yr data", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, LARGE_DAYS));
    const { computeVolatility } = await import("../../jobs/volatilityEngine.js");
    let total = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      computeVolatility(0);
      total += performance.now() - start;
    }
    expect(total / ITERATIONS).toBeLessThan(200);
  });
});

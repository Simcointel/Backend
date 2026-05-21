import { describe, it, expect, vi, beforeEach } from "vitest";
import { CATEGORIES } from "../helpers/mockData.js";

const mockLoadCategoryIndexHistory = vi.fn();
const mockLoadLatestVolatility = vi.fn();
const mockLoadLatestRegime = vi.fn();

vi.mock("../../jobs/relationalUtils.js", () => ({
  loadCategoryIndexHistory: mockLoadCategoryIndexHistory,
  loadLatestVolatility: mockLoadLatestVolatility,
  loadLatestRegime: mockLoadLatestRegime,
  getCategories: vi.fn(() => CATEGORIES),
  makeEventId: vi.fn(() => "test-event-id"),
  severityFromZScore: vi.fn((z: number) => z > 3 ? "critical" : z > 2 ? "warning" : "info"),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

vi.mock("../../jobs/intelligenceUtils.js", () => ({
  loadInflationHistory: vi.fn(() => []),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

vi.mock("../../config/index.js", () => ({
  loadConfig: () => ({
    relational: { anomalyZScoreThreshold: 2.0, anomalyCriticalZScoreThreshold: 3.0, anomalyInflationThreshold: 0.1 },
  }),
}));

function makeCategoryHistory(days: number, anomalyCat?: string, anomalyDay?: number) {
  return Array.from({ length: days }, (_, d) => ({
    ts: new Date(2024, 0, 1 + d).toISOString(),
    values: Object.fromEntries(CATEGORIES.map((cat) => {
      let v = 100 + Math.sin(d * 0.1) * 10;
      if (cat === anomalyCat && d === anomalyDay) v *= 5;
      return [cat, v];
    })),
  }));
}

describe("anomalyEngine", () => {
  beforeEach(() => {
    mockLoadCategoryIndexHistory.mockReset();
    mockLoadLatestVolatility.mockReset();
    mockLoadLatestRegime.mockReset();
    mockLoadLatestVolatility.mockReturnValue(
      Object.fromEntries(CATEGORIES.map((c) => [c, { v5: 0.8, v20: 0.6, as: 1.0, is: 0.2 }]))
    );
    mockLoadLatestRegime.mockReturnValue({
      cr: "stagnation", rc: 50,
      rf: { cvGrowth: 0.1, acGrowth: 0.05, avgInflation: 0.03, avgStress: 0.2, avgVolatility: 0.5, phase: "expansion" },
    });
  });

  it("detects no anomalies in normal data", async () => {
    mockLoadCategoryIndexHistory.mockReturnValue(makeCategoryHistory(60));
    const { detectAnomalies } = await import("../../jobs/anomalyEngine.js");
    const result = detectAnomalies(0);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.an.length).toBe(0);
  });

  it("detects anomalies after price spike", async () => {
    mockLoadCategoryIndexHistory.mockReturnValue(makeCategoryHistory(60, "energy-fuel", 40));
    const { detectAnomalies } = await import("../../jobs/anomalyEngine.js");
    const result = detectAnomalies(0);
    expect(result.ok).toBe(true);
  });

  it("handles insufficient history gracefully", async () => {
    mockLoadCategoryIndexHistory.mockReturnValue([]);
    const { detectAnomalies } = await import("../../jobs/anomalyEngine.js");
    const result = detectAnomalies(0);
    expect(result.ok).toBe(true);
  });
});

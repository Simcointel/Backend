import { describe, it, expect, vi, beforeEach } from "vitest";
import { CATEGORIES } from "../helpers/mockData.js";

const mockLoadLatestMomentum = vi.fn();
const mockLoadLatestVolatility = vi.fn();
const mockLoadLatestStress = vi.fn();
const mockLoadLatestRegime = vi.fn();

vi.mock("../../jobs/intelligenceUtils.js", () => ({
  loadIndexHistory: vi.fn(() => []),
  loadInflationHistory: vi.fn(() => []),
  loadRealmHistory: vi.fn(() => []),
  getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
  getDataRoot: vi.fn(() => "/tmp/test-dir"),
}));

vi.mock("../../jobs/relationalUtils.js", () => ({
  loadLatestMomentum: mockLoadLatestMomentum,
  loadLatestVolatility: mockLoadLatestVolatility,
  loadLatestStress: mockLoadLatestStress,
  loadLatestRegime: mockLoadLatestRegime,
  getCategories: vi.fn(() => CATEGORIES),
  getDataRoot: vi.fn(() => "/tmp/test-dir"),
}));

vi.mock("fs", () => {
  const actual = vi.importActual("fs") as typeof import("fs");
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(() => "{}"),
  };
});

describe("dashboardEngine", () => {
  beforeEach(() => {
    mockLoadLatestMomentum.mockReset();
    mockLoadLatestVolatility.mockReset();
    mockLoadLatestStress.mockReset();
    mockLoadLatestRegime.mockReset();
    mockLoadLatestMomentum.mockReturnValue(null);
    mockLoadLatestVolatility.mockReturnValue(null);
    mockLoadLatestStress.mockReturnValue(null);
    mockLoadLatestRegime.mockReturnValue({
      cr: "stagnation", rc: 50,
      rf: { cvGrowth: 0.1, acGrowth: 0.05, avgInflation: 0.03, avgStress: 0.2, avgVolatility: 0.5, phase: "expansion" },
    });
  });

  it("computeDashboardSummary returns a result for a realm", async () => {
    const { computeDashboardSummary } = await import("../../jobs/dashboardEngine.js");
    const result = computeDashboardSummary(0);
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("scores");
    expect(result).toHaveProperty("regime");
  });

  it("computeAllDashboardSummaries resolves", async () => {
    const { computeAllDashboardSummaries } = await import("../../jobs/dashboardEngine.js");
    const result = await computeAllDashboardSummaries();
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("results");
  });
});

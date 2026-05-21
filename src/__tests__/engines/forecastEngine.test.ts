import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateIndexHistory, injectIndexSpike, CATEGORIES } from "../helpers/mockData.js";

const mockLoadIndexHistory = vi.fn();
const mockLoadInflationHistory = vi.fn(() => []);
const mockLoadLatestMomentum = vi.fn(() => null);

vi.mock("../../jobs/intelligenceUtils.js", () => ({
  loadIndexHistory: mockLoadIndexHistory,
  loadInflationHistory: mockLoadInflationHistory,
  getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

vi.mock("../../jobs/relationalUtils.js", () => ({
  loadLatestMomentum: mockLoadLatestMomentum,
}));

const mockConfig = () => ({
  forecast: {
    enableForecasting: true, enableForecastPipeline: true,
    forecastWindows: ["1h", "6h", "24h"],
    forecastWindowMinutes: { "1h": 60, "6h": 360, "24h": 1440 },
    smoothingAlpha: 0.3, trendBeta: 0.1, seasonalGamma: 0.1,
    confidenceIntervalZ: 1.96, minHistoryPoints: 5, maxForecastCategories: 50,
    accuracyDecayDays: 90, enableHistoryTracking: true, enableAccuracyTracking: true,
    forecastHistoryRetentionDays: 365,
    signalThresholds: { buyPressureConfidenceMin: 0.6, overheatingZScoreMin: 2.0,
      stabilizationMomentumMax: 0.5, recoveryMomentumMin: 1.0, contractionGrowthMax: -1.0, bubbleDeviationMin: 2.5 },
  },
  macroIndexes: { categories: Object.fromEntries(CATEGORIES.map((c) => [c, {}])) },
  simco: { realms: [0] },
  dependency: {} as Record<string, unknown>,
  simulation: {} as Record<string, unknown>,
  cycles: {} as Record<string, unknown>,
});

vi.mock("../../config/index.js", () => ({ loadConfig: mockConfig }));

describe("forecastEngine", () => {
  beforeEach(() => {
    mockLoadIndexHistory.mockReset();
    mockLoadInflationHistory.mockReset();
    mockLoadLatestMomentum.mockReset();
  });

  it("returns ok with sufficient history", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 30));
    const { computeForecasts } = await import("../../jobs/forecastEngine.js");
    const result = computeForecasts(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.series).length).toBeGreaterThan(0);
    }
  });

  it("returns ok=true with empty series for insufficient history", async () => {
    mockLoadIndexHistory.mockReturnValue([]);
    const { computeForecasts } = await import("../../jobs/forecastEngine.js");
    const result = computeForecasts(0);
    expect(result.ok).toBe(true);
    expect(Object.keys(result.series).length).toBe(0);
  });

  it("returns positive trend for upward-trending history", async () => {
    const history = generateIndexHistory(0, 60);
    mockLoadIndexHistory.mockReturnValue(history);
    mockLoadLatestMomentum.mockReturnValue(null);
    const { computeForecasts } = await import("../../jobs/forecastEngine.js");
    const result = computeForecasts(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const hasPositiveTrend = Object.values(result.series).some((s) => s.trend > 0);
      expect(hasPositiveTrend).toBe(true);
    }
  });

  it("forecast confidence bounds are finite", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 60));
    const { computeForecasts } = await import("../../jobs/forecastEngine.js");
    const result = computeForecasts(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const s of Object.values(result.series)) {
        for (const pt of s.fc) {
          expect(Number.isFinite(pt.v)).toBe(true);
          expect(Number.isFinite(pt.cl)).toBe(true);
          expect(Number.isFinite(pt.cu)).toBe(true);
        }
      }
    }
  });

  it("reliability is between 0 and 1", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 60));
    const { computeForecasts } = await import("../../jobs/forecastEngine.js");
    const result = computeForecasts(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const s of Object.values(result.series)) {
        expect(s.reliability).toBeGreaterThanOrEqual(0);
        expect(s.reliability).toBeLessThanOrEqual(1);
      }
    }
  });

  it("handles price spike producing finite forecasts", async () => {
    const history = generateIndexHistory(0, 60);
    injectIndexSpike(history, "energy-fuel", 30, 10);
    mockLoadIndexHistory.mockReturnValue(history);
    const { computeForecasts } = await import("../../jobs/forecastEngine.js");
    const result = computeForecasts(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const s of Object.values(result.series)) {
        for (const pt of s.fc) {
          expect(Number.isFinite(pt.v)).toBe(true);
          expect(Number.isFinite(pt.cl)).toBe(true);
          expect(Number.isFinite(pt.cu)).toBe(true);
        }
      }
    }
  });

  it("defaults to enabled forecasting", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 30));
    const { computeForecasts } = await import("../../jobs/forecastEngine.js");
    const result = computeForecasts(0);
    expect(result.ok).toBe(true);
  });

  it("computeAllForecasts returns results array", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 30));
    const { computeAllForecasts } = await import("../../jobs/forecastEngine.js");
    const result = await computeAllForecasts();
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.some((r: { ok: boolean }) => r.ok)).toBe(true);
  });

  it("forecasts for all categories when sufficient history", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 60));
    const { computeForecasts } = await import("../../jobs/forecastEngine.js");
    const result = computeForecasts(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const cat of CATEGORIES) {
        expect(result.series[cat]).toBeDefined();
      }
    }
  });

  it("lower confidence bound is below upper bound", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 60));
    const { computeForecasts } = await import("../../jobs/forecastEngine.js");
    const result = computeForecasts(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const s of Object.values(result.series)) {
        for (const pt of s.fc) {
          expect(pt.cl).toBeLessThanOrEqual(pt.cu);
        }
      }
    }
  });

  it("volatility is non-negative", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 60));
    const { computeForecasts } = await import("../../jobs/forecastEngine.js");
    const result = computeForecasts(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const s of Object.values(result.series)) {
        expect(s.volatility).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateIndexHistory, CATEGORIES } from "../helpers/mockData.js";

const mockLoadIndexHistory = vi.fn();
const mockLoadInflationHistory = vi.fn(() => []);
const mockLoadLatestMomentum = vi.fn(() => null);
const mockLoadLatestVolatility = vi.fn(() => null);
const mockLoadLatestStress = vi.fn(() => null);
const mockLoadLatestRegime = vi.fn(() => null);

vi.mock("../../jobs/intelligenceUtils.js", () => ({
  loadIndexHistory: mockLoadIndexHistory,
  loadInflationHistory: mockLoadInflationHistory,
  getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

vi.mock("../../jobs/relationalUtils.js", () => ({
  loadLatestMomentum: mockLoadLatestMomentum,
  loadLatestVolatility: mockLoadLatestVolatility,
  loadLatestStress: mockLoadLatestStress,
  loadLatestRegime: mockLoadLatestRegime,
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
    signalThresholds: {
      buyPressureConfidenceMin: 0.6, overheatingZScoreMin: 2.0,
      stabilizationMomentumMax: 0.5, recoveryMomentumMin: 1.0,
      contractionGrowthMax: -1.0, bubbleDeviationMin: 2.5,
    },
  },
  macroIndexes: { categories: Object.fromEntries(CATEGORIES.map((c) => [c, {}])) },
  simco: { realms: [0] },
  dependency: {} as Record<string, unknown>,
  simulation: {} as Record<string, unknown>,
  cycles: {} as Record<string, unknown>,
});

vi.mock("../../config/index.js", () => ({ loadConfig: mockConfig }));

const validSignalTypes = ["buy-pressure", "overheating", "stabilization", "recovery", "contraction", "speculative-bubble"];
const validSeverities = ["low", "medium", "high", "critical"];

describe("signalEngine", () => {
  beforeEach(() => {
    mockLoadIndexHistory.mockReset();
    mockLoadInflationHistory.mockReset();
    mockLoadLatestMomentum.mockReset();
    mockLoadLatestVolatility.mockReset();
    mockLoadLatestStress.mockReset();
    mockLoadLatestRegime.mockReset();
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 60));
  });

  it("returns ok with signals array", async () => {
    const { generateSignals } = await import("../../jobs/signalEngine.js");
    const result = generateSignals(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.signals)).toBe(true);
    }
  });

  it("signal types are valid", async () => {
    const { generateSignals } = await import("../../jobs/signalEngine.js");
    const result = generateSignals(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const sig of result.signals) {
        expect(validSignalTypes).toContain(sig.type);
      }
    }
  });

  it("severity values are valid", async () => {
    const { generateSignals } = await import("../../jobs/signalEngine.js");
    const result = generateSignals(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const sig of result.signals) {
        expect(validSeverities).toContain(sig.severity);
      }
    }
  });

  it("confidence is between 0 and 1", async () => {
    const { generateSignals } = await import("../../jobs/signalEngine.js");
    const result = generateSignals(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const sig of result.signals) {
        expect(sig.confidence).toBeGreaterThanOrEqual(0);
        expect(sig.confidence).toBeLessThanOrEqual(1);
      }
    }
  });

  it("label is a non-empty string", async () => {
    const { generateSignals } = await import("../../jobs/signalEngine.js");
    const result = generateSignals(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const sig of result.signals) {
        expect(typeof sig.label).toBe("string");
        expect(sig.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("affected sectors are valid categories", async () => {
    const { generateSignals } = await import("../../jobs/signalEngine.js");
    const result = generateSignals(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const sig of result.signals) {
        expect(Array.isArray(sig.affectedSectors)).toBe(true);
        for (const sector of sig.affectedSectors) {
          expect(CATEGORIES).toContain(sector);
        }
      }
    }
  });

  it("estimated duration is positive", async () => {
    const { generateSignals } = await import("../../jobs/signalEngine.js");
    const result = generateSignals(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const sig of result.signals) {
        expect(sig.estimatedDurationDays).toBeGreaterThan(0);
      }
    }
  });

  it("indicators array is non-empty per signal", async () => {
    const { generateSignals } = await import("../../jobs/signalEngine.js");
    const result = generateSignals(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const sig of result.signals) {
        expect(Array.isArray(sig.indicators)).toBe(true);
        expect(sig.indicators.length).toBeGreaterThan(0);
      }
    }
  });

  it("handles insufficient history gracefully", async () => {
    mockLoadIndexHistory.mockReturnValue([]);
    const { generateSignals } = await import("../../jobs/signalEngine.js");
    const result = generateSignals(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.signals)).toBe(true);
    }
  });

  it("is deterministic: same input, same signal set", async () => {
    const { generateSignals: gs1 } = await import("../../jobs/signalEngine.js");
    const r1 = gs1(0);
    vi.resetModules();
    vi.mock("../../jobs/intelligenceUtils.js", () => ({
      loadIndexHistory: () => generateIndexHistory(0, 60),
      loadInflationHistory: () => [],
      getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
      getDataRoot: vi.fn(() => "/tmp/test"),
    }));
    vi.mock("../../jobs/relationalUtils.js", () => ({
      loadLatestMomentum: () => null,
      loadLatestVolatility: () => null,
      loadLatestStress: () => null,
      loadLatestRegime: () => null,
    }));
    vi.mock("../../config/index.js", () => ({ loadConfig: mockConfig }));
    const { generateSignals: gs2 } = await import("../../jobs/signalEngine.js");
    const r2 = gs2(0);
    expect(r1.ok).toBe(r2.ok);
    if (r1.ok && r2.ok) {
      expect(r1.signals.map((s) => s.type)).toEqual(r2.signals.map((s) => s.type));
    }
  });

  it("generateAllSignals returns results array", async () => {
    const { generateAllSignals } = await import("../../jobs/signalEngine.js");
    const result = await generateAllSignals();
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
  });
});

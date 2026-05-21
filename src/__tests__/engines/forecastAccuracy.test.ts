import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { generateIndexHistory, CATEGORIES } from "../helpers/mockData.js";
import { FilesystemSandbox } from "../helpers/sandbox.js";

let sandbox: FilesystemSandbox;
const mockLoadIndexHistory = vi.fn();

vi.mock("../../jobs/intelligenceUtils.js", () => ({
  loadIndexHistory: mockLoadIndexHistory,
  getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
  getDataRoot: vi.fn(() => sandbox ? sandbox.root : "/tmp/test"),
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

describe("forecastAccuracy", () => {
  beforeAll(() => {
    sandbox = new FilesystemSandbox();
    sandbox.init();
  });

  afterAll(() => sandbox.destroy());

  beforeEach(() => {
    mockLoadIndexHistory.mockReset();
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 30));
  });

  it("trackForecastOutcome returns a forecast record with correct fields", async () => {
    const { trackForecastOutcome } = await import("../../jobs/forecastHistory.js");
    const record = trackForecastOutcome(0, "2024-01-01T00:00:00.000Z", "24h", "raw-materials", 105.5);
    expect(record.forecastTime).toBe("2024-01-01T00:00:00.000Z");
    expect(record.forecastWindow).toBe("24h");
    expect(record.category).toBe("raw-materials");
    expect(record.predicted).toBe(105.5);
  });

  it("computeAccuracy returns ok for empty history", async () => {
    const { computeAccuracy } = await import("../../jobs/forecastHistory.js");
    const result = computeAccuracy(0);
    expect(result.ok).toBe(true);
  });

  it("computeAccuracy with pre-written history files has records", async () => {
    const historyDir = "aggregates/forecast-history/realm-0";
    sandbox.writeJson(historyDir + "/record-1.json", {
      records: [
        { forecastTime: "2024-01-01T00:00:00.000Z", forecastWindow: "24h", category: "raw-materials", predicted: 105.5, actual: 106.0, error: -0.5, absError: 0.5, absPctError: 0.47, directionCorrect: true },
        { forecastTime: "2024-01-02T00:00:00.000Z", forecastWindow: "24h", category: "raw-materials", predicted: 110.0, actual: 108.0, error: 2.0, absError: 2.0, absPctError: 1.85, directionCorrect: false },
      ],
    });
    const { computeAccuracy } = await import("../../jobs/forecastHistory.js");
    const result = computeAccuracy(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.metrics).length).toBeGreaterThan(0);
      const rm = result.metrics["raw-materials"];
      expect(rm).toBeDefined();
      expect(Number.isFinite(rm.mae)).toBe(true);
      expect(rm.sampleCount).toBeGreaterThan(0);
    }
  });

  it("MAE is non-negative", async () => {
    const historyDir = "aggregates/forecast-history/realm-0";
    sandbox.writeJson(historyDir + "/record-1.json", {
      records: [
        { forecastTime: "2024-01-01T00:00:00.000Z", forecastWindow: "24h", category: "raw-materials", predicted: 100, actual: 102, error: -2, absError: 2, absPctError: 1.96, directionCorrect: true },
      ],
    });
    const { computeAccuracy } = await import("../../jobs/forecastHistory.js");
    const result = computeAccuracy(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const metrics of Object.values(result.metrics)) {
        expect(metrics.mae).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("directional accuracy is between 0 and 1", async () => {
    const historyDir = "aggregates/forecast-history/realm-0";
    sandbox.writeJson(historyDir + "/record-1.json", {
      records: [
        { forecastTime: "2024-01-01T00:00:00.000Z", forecastWindow: "24h", category: "raw-materials", predicted: 100, actual: 102, error: -2, absError: 2, absPctError: 1.96, directionCorrect: true },
        { forecastTime: "2024-01-02T00:00:00.000Z", forecastWindow: "24h", category: "raw-materials", predicted: 105, actual: 103, error: 2, absError: 2, absPctError: 1.94, directionCorrect: false },
      ],
    });
    const { computeAccuracy } = await import("../../jobs/forecastHistory.js");
    const result = computeAccuracy(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const metrics of Object.values(result.metrics)) {
        expect(metrics.directionalAccuracy).toBeGreaterThanOrEqual(0);
        expect(metrics.directionalAccuracy).toBeLessThanOrEqual(1);
      }
    }
  });

  it("volatility adjusted accuracy is finite", async () => {
    const historyDir = "aggregates/forecast-history/realm-0";
    sandbox.writeJson(historyDir + "/record-1.json", {
      records: [
        { forecastTime: "2024-01-01T00:00:00.000Z", forecastWindow: "24h", category: "raw-materials", predicted: 100, actual: 102, error: -2, absError: 2, absPctError: 1.96, directionCorrect: true },
      ],
    });
    const { computeAccuracy } = await import("../../jobs/forecastHistory.js");
    const result = computeAccuracy(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const metrics of Object.values(result.metrics)) {
        expect(Number.isFinite(metrics.volatilityAdjustedAccuracy)).toBe(true);
      }
    }
  });

  it("recentRecords contains loaded records", async () => {
    const historyDir = "aggregates/forecast-history/realm-0";
    sandbox.writeJson(historyDir + "/record-1.json", {
      records: [
        { forecastTime: "2024-01-01T00:00:00.000Z", forecastWindow: "24h", category: "raw-materials", predicted: 105.5, actual: 106, error: -0.5, absError: 0.5, absPctError: 0.47, directionCorrect: true },
      ],
    });
    const { computeAccuracy } = await import("../../jobs/forecastHistory.js");
    const result = computeAccuracy(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recentRecords.length).toBeGreaterThan(0);
      expect(result.recentRecords[0].predicted).toBe(105.5);
    }
  });

  it("handles multiple categories independently", async () => {
    const historyDir = "aggregates/forecast-history/realm-0";
    sandbox.writeJson(historyDir + "/record-1.json", {
      records: [
        { forecastTime: "2024-01-01T00:00:00.000Z", forecastWindow: "24h", category: "raw-materials", predicted: 100, actual: 102, error: -2, absError: 2, absPctError: 1.96, directionCorrect: true },
        { forecastTime: "2024-01-01T00:00:00.000Z", forecastWindow: "24h", category: "energy-fuel", predicted: 200, actual: 195, error: 5, absError: 5, absPctError: 2.56, directionCorrect: false },
      ],
    });
    const { computeAccuracy } = await import("../../jobs/forecastHistory.js");
    const result = computeAccuracy(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.metrics).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("computeAllAccuracy returns results array", async () => {
    const { computeAllAccuracy } = await import("../../jobs/forecastHistory.js");
    const result = await computeAllAccuracy();
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("handles empty forecast history gracefully for new realm", async () => {
    const { computeAccuracy } = await import("../../jobs/forecastHistory.js");
    const result = computeAccuracy(99);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.metrics).length).toBe(0);
      expect(result.recentRecords.length).toBe(0);
    }
  });
});

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { CATEGORIES } from "../helpers/mockData.js";
import { FilesystemSandbox } from "../helpers/sandbox.js";

let sandbox: FilesystemSandbox;
let dataPath = "/tmp/test-forecast-pipeline";

const mockComputeForecasts = vi.fn();
const mockRunAllSimulations = vi.fn();
const mockComputeDependencies = vi.fn();
const mockGenerateSignals = vi.fn();
const mockDetectCycle = vi.fn();
const mockEmit = vi.fn();

vi.mock("../../jobs/forecastEngine.js", () => ({ computeForecasts: mockComputeForecasts }));
vi.mock("../../jobs/simulationEngine.js", () => ({ runAllSimulations: mockRunAllSimulations }));
vi.mock("../../jobs/dependencyEngine.js", () => ({ computeDependencies: mockComputeDependencies }));
vi.mock("../../jobs/signalEngine.js", () => ({ generateSignals: mockGenerateSignals }));
vi.mock("../../jobs/cycleEngine.js", () => ({ detectCycle: mockDetectCycle }));
vi.mock("../../events/eventBus.js", () => ({ emit: mockEmit }));

vi.mock("../../jobs/intelligenceUtils.js", () => ({
  getDataRoot: vi.fn(() => dataPath),
  getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
}));

const mockConfig = () => ({
  dataRepo: { path: dataPath },
  simco: { realms: [0] },
  macroIndexes: { categories: Object.fromEntries(CATEGORIES.map((c) => [c, {}])) },
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
  simulation: {
    enableSimulation: true, maxSimulationSteps: 10,
    shockMagnitudeDefault: 2.0, shockMagnitudeRange: { min: 0.5, max: 5.0 },
    propagationDecayFactor: 0.5, recoveryEstimateMonths: { min: 1, max: 24 },
    scenarios: {
      "recession": { category: "all", shockPct: -15, durationDays: 180, description: "Broad economic contraction" },
      "boom": { category: "all", shockPct: 25, durationDays: 120, description: "Rapid economic expansion" },
    },
    sectorDependencies: {},
  },
  dependency: {
    dependencyMatrix: {
      "energy-fuel": { "industrial-goods": 0.2, "consumer-goods": 0.3 },
      "industrial-goods": { "consumer-goods": 0.6, "electronics": 0.5 },
    },
    bottleneckThreshold: 0.7, criticalResourceThreshold: 0.8,
    cascadeDepthMax: 5, dependencyRiskDecay: 0.6,
    upstreamPressureWeight: 0.4, downstreamPressureWeight: 0.3, substitutabilityFactor: 0.2,
  },
  cycles: {
    enableCycleDetection: true, minCycleDays: 30, maxCycleDays: 730,
    expansionThresholds: { cvGrowthMin: 0.5, momentumMin: 0.5, inflationMax: 3.0, stressMax: 0.3 },
    speculativeThresholds: { momentumMin: 3.0, volatilityMax: 1.5, accelerationPositive: true },
    overheatingThresholds: { inflationMin: 3.0, stressMin: 0.4, volatilityMin: 2.0 },
    contractionThresholds: { cvGrowthMax: -0.5, momentumMin: -2.0, stressMin: 0.3 },
    recoveryThresholds: { cvGrowthMin: -0.5, momentumTrendRising: true, stressMax: 0.35 },
    regimeTransitionWeights: {},
    cycleStabilityWeights: { duration: 0.3, intensity: 0.3, transitionCount: 0.2, volatility: 0.2 },
  },
});

vi.mock("../../config/index.js", () => ({ loadConfig: mockConfig }));

describe("forecastPipeline", () => {
  beforeAll(() => {
    sandbox = new FilesystemSandbox();
    sandbox.init();
    dataPath = sandbox.root;
  });

  afterAll(() => sandbox.destroy());

  beforeEach(() => {
    mockComputeForecasts.mockReset();
    mockRunAllSimulations.mockReset();
    mockComputeDependencies.mockReset();
    mockGenerateSignals.mockReset();
    mockDetectCycle.mockReset();
    mockEmit.mockReset();
  });

  it("runs all pipeline components and returns ok", async () => {
    mockComputeForecasts.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, series: { "raw-materials": { category: "raw-materials", history: [100], fc: [], method: "es", trend: 0, volatility: 0, reliability: 1 } } });
    mockRunAllSimulations.mockReturnValue({ ok: true, results: [{ scenario: "recession", ok: true }] });
    mockComputeDependencies.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, criticalResources: [], bottleneckChains: [], risks: [] });
    mockGenerateSignals.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, signals: [] });
    mockDetectCycle.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, current: null, history: [], transitionProbabilities: {}, stability: 0.5 });

    const { runForecastPipeline } = await import("../../jobs/forecastPipeline.js");
    const result = runForecastPipeline(0);
    expect(result.ok).toBe(true);
    expect(result.forecasts.ok).toBe(true);
    expect(result.simulations.ok).toBe(true);
    expect(result.dependencies.ok).toBe(true);
    expect(result.signals.ok).toBe(true);
    expect(result.cycles.ok).toBe(true);
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("reports component failures gracefully", async () => {
    mockComputeForecasts.mockImplementation(() => { throw new Error("forecast failed"); });
    mockRunAllSimulations.mockReturnValue({ ok: false, results: [] });
    mockComputeDependencies.mockReturnValue({ ok: false, t: "", r: 0, criticalResources: [], bottleneckChains: [], risks: [], error: "deps failed" });
    mockGenerateSignals.mockReturnValue({ ok: false, t: "", r: 0, signals: [], error: "signals failed" });
    mockDetectCycle.mockReturnValue({ ok: false, t: "", r: 0, current: null, history: [], transitionProbabilities: {}, stability: 0, error: "cycle failed" });

    const { runForecastPipeline } = await import("../../jobs/forecastPipeline.js");
    const result = runForecastPipeline(0);
    expect(result.ok).toBe(false);
    expect(result.forecasts.ok).toBe(false);
    expect(result.simulations.ok).toBe(false);
  });

  it("emits pipeline:forecast:complete event", async () => {
    mockComputeForecasts.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, series: {} });
    mockRunAllSimulations.mockReturnValue({ ok: true, results: [] });
    mockComputeDependencies.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, criticalResources: [], bottleneckChains: [], risks: [] });
    mockGenerateSignals.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, signals: [] });
    mockDetectCycle.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, current: null, history: [], transitionProbabilities: {}, stability: 0.5 });

    const { runForecastPipeline } = await import("../../jobs/forecastPipeline.js");
    runForecastPipeline(0);
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith("pipeline:forecast:complete", expect.any(Object), 0);
  });

  it("handles all realms via runAllForecastPipelines", async () => {
    mockComputeForecasts.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, series: {} });
    mockRunAllSimulations.mockReturnValue({ ok: true, results: [] });
    mockComputeDependencies.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, criticalResources: [], bottleneckChains: [], risks: [] });
    mockGenerateSignals.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, signals: [] });
    mockDetectCycle.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, current: null, history: [], transitionProbabilities: {}, stability: 0.5 });

    const { runAllForecastPipelines } = await import("../../jobs/forecastPipeline.js");
    const result = await runAllForecastPipelines();
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("produces correct result types", async () => {
    mockComputeForecasts.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, series: {} });
    mockRunAllSimulations.mockReturnValue({ ok: true, results: [] });
    mockComputeDependencies.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, criticalResources: [], bottleneckChains: [], risks: [] });
    mockGenerateSignals.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, signals: [] });
    mockDetectCycle.mockReturnValue({ ok: true, t: "2024-01-01", r: 0, current: null, history: [], transitionProbabilities: {}, stability: 0.5 });

    const { runForecastPipeline } = await import("../../jobs/forecastPipeline.js");
    const result = runForecastPipeline(0);
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("durationMs");
    expect(result).toHaveProperty("forecasts");
    expect(result).toHaveProperty("simulations");
    expect(result).toHaveProperty("dependencies");
    expect(result).toHaveProperty("signals");
    expect(result).toHaveProperty("cycles");
    expect(result.forecasts).toHaveProperty("ok");
    expect(result.forecasts).toHaveProperty("count");
    expect(result.forecasts).toHaveProperty("durationMs");
  });
});

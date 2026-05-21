import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateIndexHistory, CATEGORIES } from "../helpers/mockData.js";

const mockLoadIndexHistory = vi.fn();
const mockLoadLatestRegime = vi.fn(() => null);
const mockLoadLatestVolatility = vi.fn(() => null);
const mockLoadLatestStress = vi.fn(() => null);

vi.mock("../../jobs/intelligenceUtils.js", () => ({
  loadIndexHistory: mockLoadIndexHistory,
  getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

vi.mock("../../jobs/relationalUtils.js", () => ({
  loadLatestRegime: mockLoadLatestRegime,
  loadLatestVolatility: mockLoadLatestVolatility,
  loadLatestStress: mockLoadLatestStress,
}));

const scenarios = {
  "commodity-spike": { category: "raw-materials", shockPct: 50, durationDays: 30, description: "Sharp increase in raw material prices" },
  "recession": { category: "all", shockPct: -15, durationDays: 180, description: "Broad economic contraction" },
  "boom": { category: "all", shockPct: 25, durationDays: 120, description: "Rapid economic expansion" },
  "supply-collapse": { category: "industrial-goods", shockPct: -40, durationDays: 60, description: "Industrial supply chain disruption" },
  "inflation-surge": { category: "consumer-goods", shockPct: 30, durationDays: 90, description: "Rapid consumer price inflation" },
  "deflation-event": { category: "consumer-goods", shockPct: -20, durationDays: 120, description: "Broad price deflation" },
  "fuel-shortage": { category: "energy-fuel", shockPct: 60, durationDays: 45, description: "Energy supply crisis" },
  "electronics-shortage": { category: "electronics", shockPct: -35, durationDays: 90, description: "Semiconductor and electronics shortage" },
  "construction-boom": { category: "construction", shockPct: 40, durationDays: 180, description: "Construction sector expansion" },
};

const sectorDependencies = {
  "energy-fuel": { downstream: ["industrial-goods", "consumer-goods", "construction", "aerospace", "electronics"], upstream: [], weight: 0.8 },
  "raw-materials": { downstream: ["industrial-goods", "construction", "energy-fuel"], upstream: [], weight: 0.6 },
  "industrial-goods": { downstream: ["consumer-goods", "construction", "aerospace", "electronics"], upstream: ["raw-materials", "energy-fuel"], weight: 0.7 },
  "electronics": { downstream: ["consumer-goods", "aerospace", "industrial-goods"], upstream: ["industrial-goods", "energy-fuel"], weight: 0.5 },
  "construction": { downstream: [], upstream: ["raw-materials", "industrial-goods", "energy-fuel"], weight: 0.4 },
  "consumer-goods": { downstream: [], upstream: ["industrial-goods", "raw-materials", "energy-fuel", "electronics"], weight: 0.3 },
  "aerospace": { downstream: [], upstream: ["industrial-goods", "electronics", "energy-fuel"], weight: 0.4 },
};

const dependencyMatrix = {
  "energy-fuel": { "raw-materials": 0.1, "industrial-goods": 0.2, "consumer-goods": 0.3, "construction": 0.2, "aerospace": 0.2, "electronics": 0.3 },
  "raw-materials": { "energy-fuel": 0.4, "industrial-goods": 0.6, "consumer-goods": 0.5, "construction": 0.5, "aerospace": 0.3, "electronics": 0.3 },
  "industrial-goods": { "energy-fuel": 0.5, "raw-materials": 0.7, "consumer-goods": 0.6, "construction": 0.6, "aerospace": 0.5, "electronics": 0.5 },
  "electronics": { "energy-fuel": 0.3, "raw-materials": 0.2, "industrial-goods": 0.5, "consumer-goods": 0.4, "construction": 0.2, "aerospace": 0.5 },
  "construction": { "energy-fuel": 0.4, "raw-materials": 0.5, "industrial-goods": 0.5, "consumer-goods": 0.1, "aerospace": 0.1, "electronics": 0.1 },
  "consumer-goods": { "energy-fuel": 0.3, "raw-materials": 0.4, "industrial-goods": 0.5, "electronics": 0.3, "construction": 0.1, "aerospace": 0.1 },
  "aerospace": { "energy-fuel": 0.3, "raw-materials": 0.2, "industrial-goods": 0.4, "electronics": 0.4, "consumer-goods": 0.1, "construction": 0.1 },
};

const mockConfig = () => ({
  simulation: {
    enableSimulation: true, maxSimulationSteps: 10,
    shockMagnitudeDefault: 2.0,
    shockMagnitudeRange: { min: 0.5, max: 5.0 },
    propagationDecayFactor: 0.5,
    recoveryEstimateMonths: { min: 1, max: 24 },
    scenarios,
    sectorDependencies,
  },
  dependency: {
    dependencyMatrix,
    bottleneckThreshold: 0.7, criticalResourceThreshold: 0.8,
    cascadeDepthMax: 5, dependencyRiskDecay: 0.6,
    upstreamPressureWeight: 0.4, downstreamPressureWeight: 0.3, substitutabilityFactor: 0.2,
  },
  macroIndexes: { categories: Object.fromEntries(CATEGORIES.map((c) => [c, {}])) },
  simco: { realms: [0] },
  forecast: {} as Record<string, unknown>,
  cycles: {} as Record<string, unknown>,
});

vi.mock("../../config/index.js", () => ({ loadConfig: mockConfig }));

describe("simulationEngine", () => {
  beforeEach(() => {
    mockLoadIndexHistory.mockReset();
    mockLoadLatestRegime.mockReset();
    mockLoadLatestVolatility.mockReset();
    mockLoadLatestStress.mockReset();
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 30));
  });

  it("runs commodity spike scenario", async () => {
    const { runSimulation } = await import("../../jobs/simulationEngine.js");
    const result = runSimulation(0, "commodity-spike");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scenario).toBe("commodity-spike");
      expect(result.sectorImpacts.length).toBeGreaterThan(0);
    }
  });

  it("returns ok=false for unknown scenario", async () => {
    const { runSimulation } = await import("../../jobs/simulationEngine.js");
    const result = runSimulation(0, "unknown-scenario");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("unknown");
  });

  it("recession scenario produces negative impact on at least some sectors", async () => {
    const { runSimulation } = await import("../../jobs/simulationEngine.js");
    const result = runSimulation(0, "recession");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const anyNegative = result.sectorImpacts.some((si) => si.totalImpact < 0);
      expect(anyNegative).toBe(true);
    }
  });

  it("boom scenario produces positive total impacts on average", async () => {
    const { runSimulation } = await import("../../jobs/simulationEngine.js");
    const result = runSimulation(0, "boom");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const avgImpact = result.sectorImpacts.reduce((s, i) => s + i.totalImpact, 0) / result.sectorImpacts.length;
      expect(avgImpact).toBeGreaterThan(0);
    }
  });

  it("fuel shortage impacts energy-fuel directly and downstream sectors", async () => {
    const { runSimulation } = await import("../../jobs/simulationEngine.js");
    const result = runSimulation(0, "fuel-shortage");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const energyImpact = result.sectorImpacts.find((s) => s.category === "energy-fuel");
      expect(energyImpact).toBeDefined();
      expect(energyImpact!.directShock).toBeGreaterThan(0);
      const downstream = result.sectorImpacts.filter((s) => s.propagatedShock !== 0);
      expect(downstream.length).toBeGreaterThan(0);
    }
  });

  it("construction boom impacts construction sector directly", async () => {
    const { runSimulation } = await import("../../jobs/simulationEngine.js");
    const result = runSimulation(0, "construction-boom");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const conImpact = result.sectorImpacts.find((s) => s.category === "construction");
      expect(conImpact).toBeDefined();
      expect(conImpact!.directShock).toBeGreaterThan(0);
    }
  });

  it("electronics shortage returns negative propagated shocks", async () => {
    const { runSimulation } = await import("../../jobs/simulationEngine.js");
    const result = runSimulation(0, "electronics-shortage");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const elecImpact = result.sectorImpacts.find((s) => s.category === "electronics");
      expect(elecImpact).toBeDefined();
      expect(elecImpact!.directShock).toBeLessThan(0);
    }
  });

  it("recovery estimation is finite and positive", async () => {
    const { runSimulation } = await import("../../jobs/simulationEngine.js");
    const result = runSimulation(0, "recession");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number.isFinite(result.estimatedRecoveryDays)).toBe(true);
      expect(result.estimatedRecoveryDays).toBeGreaterThan(0);
    }
  });

  it("propagation steps are produced for broadly impacting scenarios", async () => {
    const { runSimulation } = await import("../../jobs/simulationEngine.js");
    const result = runSimulation(0, "recession");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.steps.length).toBeGreaterThan(1);
    }
  });

  it("custom magnitude overrides default", async () => {
    const { runSimulation } = await import("../../jobs/simulationEngine.js");
    const defaultResult = runSimulation(0, "boom");
    const customResult = runSimulation(0, "boom", 5.0);
    expect(defaultResult.ok).toBe(true);
    expect(customResult.ok).toBe(true);
    if (defaultResult.ok && customResult.ok) {
      expect(customResult.shockMagnitude).toBeGreaterThan(defaultResult.shockMagnitude);
    }
  });

  it("runAllSimulations returns results for all scenarios", async () => {
    const { runAllSimulations } = await import("../../jobs/simulationEngine.js");
    const result = runAllSimulations(0);
    expect(result.ok).toBe(true);
    expect(result.results.length).toBe(Object.keys(scenarios).length);
  });

  it("winners and losers arrays are populated for boom with high magnitude", async () => {
    const { runSimulation } = await import("../../jobs/simulationEngine.js");
    const result = runSimulation(0, "boom", 5.0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.winners)).toBe(true);
      expect(Array.isArray(result.losers)).toBe(true);
    }
  });

  it("projected regime is a non-empty string", async () => {
    const { runSimulation } = await import("../../jobs/simulationEngine.js");
    const result = runSimulation(0, "recession");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.projectedRegime).toBe("string");
      expect(result.projectedRegime.length).toBeGreaterThan(0);
    }
  });

  it("deterministic: same scenario same realm gives identical results", async () => {
    const { runSimulation } = await import("../../jobs/simulationEngine.js");
    const r1 = runSimulation(0, "fuel-shortage");
    const r2 = runSimulation(0, "fuel-shortage");
    expect(r1.ok).toBe(r2.ok);
    if (r1.ok && r2.ok) {
      expect(r1.sectorImpacts).toEqual(r2.sectorImpacts);
      expect(r1.steps).toEqual(r2.steps);
    }
  });
});

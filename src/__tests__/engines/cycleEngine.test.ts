import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateIndexHistory, CATEGORIES } from "../helpers/mockData.js";

const mockLoadIndexHistory = vi.fn();
const mockLoadRealmHistory = vi.fn(() => []);
const mockLoadLatestMomentum = vi.fn(() => null);
const mockLoadLatestVolatility = vi.fn(() => null);
const mockLoadLatestStress = vi.fn(() => null);
const mockLoadLatestRegime = vi.fn(() => null);

vi.mock("../../jobs/intelligenceUtils.js", () => ({
  loadIndexHistory: mockLoadIndexHistory,
  loadRealmHistory: mockLoadRealmHistory,
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
  cycles: {
    enableCycleDetection: true, minCycleDays: 30, maxCycleDays: 730,
    expansionThresholds: { cvGrowthMin: 0.5, momentumMin: 0.5, inflationMax: 3.0, stressMax: 0.3 },
    speculativeThresholds: { momentumMin: 3.0, volatilityMax: 1.5, accelerationPositive: true },
    overheatingThresholds: { inflationMin: 3.0, stressMin: 0.4, volatilityMin: 2.0 },
    contractionThresholds: { cvGrowthMax: -0.5, momentumMin: -2.0, stressMin: 0.3 },
    recoveryThresholds: { cvGrowthMin: -0.5, momentumTrendRising: true, stressMax: 0.35 },
    regimeTransitionWeights: {
      expansion: { speculative: 0.3, overheating: 0.2, contraction: 0.1, recovery: 0.1 },
      speculative: { overheating: 0.4, expansion: 0.2, contraction: 0.15 },
      overheating: { contraction: 0.5, expansion: 0.1, recovery: 0.1 },
      contraction: { recovery: 0.4, stagnation: 0.3, expansion: 0.1 },
      recovery: { expansion: 0.5, stagnation: 0.2, contraction: 0.1 },
      stagnation: { recovery: 0.3, expansion: 0.2, contraction: 0.15 },
    },
    cycleStabilityWeights: { duration: 0.3, intensity: 0.3, transitionCount: 0.2, volatility: 0.2 },
  },
  macroIndexes: { categories: Object.fromEntries(CATEGORIES.map((c) => [c, {}])) },
  simco: { realms: [0] },
  forecast: {} as Record<string, unknown>,
  simulation: {} as Record<string, unknown>,
  dependency: {} as Record<string, unknown>,
});

vi.mock("../../config/index.js", () => ({ loadConfig: mockConfig }));

describe("cycleEngine", () => {
  beforeEach(() => {
    mockLoadIndexHistory.mockReset();
    mockLoadRealmHistory.mockReset();
    mockLoadLatestMomentum.mockReset();
    mockLoadLatestVolatility.mockReset();
    mockLoadLatestStress.mockReset();
    mockLoadLatestRegime.mockReset();
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 60));
  });

  it("returns ok with a valid cycle phase", async () => {
    const { detectCycle } = await import("../../jobs/cycleEngine.js");
    const result = detectCycle(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.current).not.toBeNull();
      const validPhases = ["expansion", "speculative", "overheating", "contraction", "recovery", "stagnation"];
      expect(validPhases).toContain(result.current!.phase);
    }
  });

  it("confidence is between 0 and 1", async () => {
    const { detectCycle } = await import("../../jobs/cycleEngine.js");
    const result = detectCycle(0);
    expect(result.ok).toBe(true);
    if (result.ok && result.current) {
      expect(result.current.confidence).toBeGreaterThanOrEqual(0);
      expect(result.current.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("duration days is non-negative", async () => {
    const { detectCycle } = await import("../../jobs/cycleEngine.js");
    const result = detectCycle(0);
    expect(result.ok).toBe(true);
    if (result.ok && result.current) {
      expect(result.current.durationDays).toBeGreaterThanOrEqual(0);
    }
  });

  it("intensity is non-negative", async () => {
    const { detectCycle } = await import("../../jobs/cycleEngine.js");
    const result = detectCycle(0);
    expect(result.ok).toBe(true);
    if (result.ok && result.current) {
      expect(result.current.intensity).toBeGreaterThanOrEqual(0);
    }
  });

  it("stability is between 0 and 1", async () => {
    const { detectCycle } = await import("../../jobs/cycleEngine.js");
    const result = detectCycle(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stability).toBeGreaterThanOrEqual(0);
      expect(result.stability).toBeLessThanOrEqual(1);
    }
  });

  it("transition probabilities have valid keys", async () => {
    const { detectCycle } = await import("../../jobs/cycleEngine.js");
    const result = detectCycle(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const validPhases = ["expansion", "speculative", "overheating", "contraction", "recovery", "stagnation"];
      for (const fromPhase of Object.keys(result.transitionProbabilities)) {
        expect(validPhases).toContain(fromPhase);
        for (const toPhase of Object.keys(result.transitionProbabilities[fromPhase])) {
          expect(validPhases).toContain(toPhase);
          const prob = result.transitionProbabilities[fromPhase][toPhase];
          expect(Number.isFinite(prob)).toBe(true);
        }
      }
    }
  });

  it("is deterministic: same input gives same phase", async () => {
    const { detectCycle: dc1 } = await import("../../jobs/cycleEngine.js");
    const r1 = dc1(0);
    vi.resetModules();
    vi.mock("../../jobs/intelligenceUtils.js", () => ({
      loadIndexHistory: () => generateIndexHistory(0, 60),
      loadRealmHistory: () => [],
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
    const { detectCycle: dc2 } = await import("../../jobs/cycleEngine.js");
    const r2 = dc2(0);
    expect(r1.ok).toBe(r2.ok);
    if (r1.ok && r2.ok) {
      expect(r1.current?.phase).toBe(r2.current?.phase);
    }
  });

  it("handles realm history entries without error", async () => {
    mockLoadRealmHistory.mockReturnValue([
      { t: "2024-01-01T00:00:00.000Z", r: 0, cv: { "raw-materials": { v: 100, n: 1, rn: 0.01 } }, ac: {}, inf: {}, hi: {} },
    ]);
    const { detectCycle } = await import("../../jobs/cycleEngine.js");
    const result = detectCycle(0);
    expect(result.ok).toBe(true);
  });

  it("detectAllCycles returns results array", async () => {
    const { detectAllCycles } = await import("../../jobs/cycleEngine.js");
    const result = await detectAllCycles();
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("indicators map contains values", async () => {
    const { detectCycle } = await import("../../jobs/cycleEngine.js");
    const result = detectCycle(0);
    expect(result.ok).toBe(true);
    if (result.ok && result.current) {
      expect(typeof result.current.indicators).toBe("object");
      for (const val of Object.values(result.current.indicators)) {
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });
});

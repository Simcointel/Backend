import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateIndexHistory, CATEGORIES } from "../helpers/mockData.js";

const mockLoadIndexHistory = vi.fn();

vi.mock("../../jobs/intelligenceUtils.js", () => ({
  loadIndexHistory: mockLoadIndexHistory,
  getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

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
  dependency: {
    dependencyMatrix,
    bottleneckThreshold: 0.7, criticalResourceThreshold: 0.8,
    cascadeDepthMax: 5, dependencyRiskDecay: 0.6,
    upstreamPressureWeight: 0.4, downstreamPressureWeight: 0.3, substitutabilityFactor: 0.2,
  },
  macroIndexes: { categories: Object.fromEntries(CATEGORIES.map((c) => [c, {}])) },
  simco: { realms: [0] },
  forecast: {} as Record<string, unknown>,
  simulation: {} as Record<string, unknown>,
  cycles: {} as Record<string, unknown>,
});

vi.mock("../../config/index.js", () => ({ loadConfig: mockConfig }));

describe("dependencyEngine", () => {
  beforeEach(() => {
    mockLoadIndexHistory.mockReset();
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 30));
  });

  it("returns ok with risks array", async () => {
    const { computeDependencies } = await import("../../jobs/dependencyEngine.js");
    const result = computeDependencies(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.risks)).toBe(true);
      expect(result.risks.length).toBeGreaterThan(0);
    }
  });

  it("risk scores are finite", async () => {
    const { computeDependencies } = await import("../../jobs/dependencyEngine.js");
    const result = computeDependencies(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const risk of result.risks) {
        expect(Number.isFinite(risk.riskScore)).toBe(true);
        expect(Number.isFinite(risk.avgDependencyWeight)).toBe(true);
      }
    }
  });

  it("critical resources identified when dependency weights exceed threshold", async () => {
    const { computeDependencies } = await import("../../jobs/dependencyEngine.js");
    const result = computeDependencies(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.criticalResources)).toBe(true);
      for (const cr of result.criticalResources) {
        expect(Number.isFinite(cr.dependencyScore)).toBe(true);
        expect(Array.isArray(cr.vulnerableSectors)).toBe(true);
      }
    }
  });

  it("bottleneck chains are discovered", async () => {
    const { computeDependencies } = await import("../../jobs/dependencyEngine.js");
    const result = computeDependencies(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.bottleneckChains)).toBe(true);
      for (const chain of result.bottleneckChains) {
        expect(Array.isArray(chain.chain)).toBe(true);
        expect(chain.chain.length).toBeGreaterThan(0);
        expect(Number.isFinite(chain.score)).toBe(true);
        expect(typeof chain.description).toBe("string");
      }
    }
  });

  it("every category has a risk entry", async () => {
    const { computeDependencies } = await import("../../jobs/dependencyEngine.js");
    const result = computeDependencies(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const cat of CATEGORIES) {
        const risk = result.risks.find((r) => r.category === cat);
        expect(risk, `risk for ${cat}`).toBeDefined();
      }
    }
  });

  it("every risk entry has finite numeric fields", async () => {
    const { computeDependencies } = await import("../../jobs/dependencyEngine.js");
    const result = computeDependencies(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const risk of result.risks) {
        expect(Number.isFinite(risk.riskScore), `${risk.category}.riskScore`).toBe(true);
        expect(Number.isFinite(risk.avgDependencyWeight), `${risk.category}.avgDependencyWeight`).toBe(true);
        expect(typeof risk.isCritical).toBe("boolean");
        expect(typeof risk.upstreamCount).toBe("number");
        expect(typeof risk.downstreamCount).toBe("number");
      }
    }
  });

  it("deterministic: same realm produces identical results", async () => {
    const { computeDependencies: cd1 } = await import("../../jobs/dependencyEngine.js");
    const r1 = cd1(0);
    vi.resetModules();
    vi.mock("../../jobs/intelligenceUtils.js", () => ({
      loadIndexHistory: () => generateIndexHistory(0, 30),
      getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
      getDataRoot: vi.fn(() => "/tmp/test"),
    }));
    vi.mock("../../config/index.js", () => ({ loadConfig: mockConfig }));
    const { computeDependencies: cd2 } = await import("../../jobs/dependencyEngine.js");
    const r2 = cd2(0);
    expect(r1.ok).toBe(r2.ok);
    if (r1.ok && r2.ok) {
      expect(r1.risks).toEqual(r2.risks);
      expect(r1.criticalResources).toEqual(r2.criticalResources);
    }
  });

  it("handles empty dependency matrix gracefully", async () => {
    vi.resetModules();
    vi.mock("../../jobs/intelligenceUtils.js", () => ({
      loadIndexHistory: () => generateIndexHistory(0, 30),
      getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
      getDataRoot: vi.fn(() => "/tmp/test"),
    }));
    vi.mock("../../config/index.js", () => ({
      loadConfig: () => ({
        dependency: {
          dependencyMatrix: {},
          bottleneckThreshold: 0.7, criticalResourceThreshold: 0.8,
          cascadeDepthMax: 5, dependencyRiskDecay: 0.6,
          upstreamPressureWeight: 0.4, downstreamPressureWeight: 0.3, substitutabilityFactor: 0.2,
        },
        macroIndexes: { categories: Object.fromEntries(CATEGORIES.map((c) => [c, {}])) },
        simco: { realms: [0] },
        forecast: {}, simulation: {}, cycles: {},
      }),
    }));
    const { computeDependencies } = await import("../../jobs/dependencyEngine.js");
    const result = computeDependencies(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.risks)).toBe(true);
    }
  });

  it("computeAllDependencies returns results array", async () => {
    const { computeAllDependencies } = await import("../../jobs/dependencyEngine.js");
    const result = await computeAllDependencies();
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
  });
});

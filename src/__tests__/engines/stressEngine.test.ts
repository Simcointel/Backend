import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateIndexHistory, makeMinimalMomentumResult, makeMinimalVolatilityResult, CATEGORIES } from "../helpers/mockData.js";

const mockLoadIndexHistory = vi.fn();
const mockLoadInflationHistory = vi.fn(() => []);
const mockLoadRealmHistory = vi.fn(() => []);

vi.mock("../../jobs/intelligenceUtils.js", () => ({
  loadIndexHistory: mockLoadIndexHistory,
  loadInflationHistory: mockLoadInflationHistory,
  loadRealmHistory: mockLoadRealmHistory,
  getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

describe("stressEngine", () => {
  beforeEach(() => {
    mockLoadIndexHistory.mockReset();
    mockLoadInflationHistory.mockReset();
    mockLoadRealmHistory.mockReset();
  });

  it("produces stress results for normal markets", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 60));
    mockLoadInflationHistory.mockReturnValue([]);
    mockLoadRealmHistory.mockReturnValue([]);
    const { computeStress } = await import("../../jobs/stressEngine.js");
    const result = computeStress(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number.isFinite(result.rs.os)).toBe(true);
    }
  });

  it("accepts pre-computed momentum and volatility", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 60));
    mockLoadInflationHistory.mockReturnValue([]);
    mockLoadRealmHistory.mockReturnValue([]);
    const momentum = makeMinimalMomentumResult(0);
    const volatility = makeMinimalVolatilityResult(0);
    const { computeStress } = await import("../../jobs/stressEngine.js");
    const result = computeStress(0, momentum, volatility);
    expect(result.ok).toBe(true);
  });

  it("all stress values are finite", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 60));
    mockLoadInflationHistory.mockReturnValue([]);
    mockLoadRealmHistory.mockReturnValue([]);
    const { computeStress } = await import("../../jobs/stressEngine.js");
    const result = computeStress(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number.isFinite(result.rs.os)).toBe(true);
      expect(Number.isFinite(result.rs.af)).toBe(true);
      expect(Number.isFinite(result.rs.tf)).toBe(true);
    }
  });
});

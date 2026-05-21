import { describe, it, expect, vi, beforeEach } from "vitest";
import { CATEGORIES } from "../helpers/mockData.js";

const mockLoadLatestMomentum = vi.fn();
const mockLoadLatestVolatility = vi.fn();
const mockLoadLatestStress = vi.fn();
const mockLoadLatestRegime = vi.fn();
const mockLoadCategoryIndexHistory = vi.fn();

vi.mock("../../jobs/relationalUtils.js", () => ({
  loadLatestMomentum: mockLoadLatestMomentum,
  loadLatestVolatility: mockLoadLatestVolatility,
  loadLatestStress: mockLoadLatestStress,
  loadLatestRegime: mockLoadLatestRegime,
  loadCategoryIndexHistory: mockLoadCategoryIndexHistory,
  getCategories: vi.fn(() => CATEGORIES),
  makeEventId: vi.fn(() => "test-event-id"),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

vi.mock("../../jobs/intelligenceUtils.js", () => ({
  loadInflationHistory: vi.fn(() => []),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

describe("contagionEngine", () => {
  beforeEach(() => {
    mockLoadLatestMomentum.mockReset();
    mockLoadLatestVolatility.mockReset();
    mockLoadLatestStress.mockReset();
    mockLoadLatestRegime.mockReset();
    mockLoadCategoryIndexHistory.mockReset();
    mockLoadLatestMomentum.mockReturnValue(null);
    mockLoadLatestVolatility.mockReturnValue(null);
    mockLoadLatestStress.mockReturnValue(null);
    mockLoadLatestRegime.mockReturnValue(null);
    mockLoadCategoryIndexHistory.mockReturnValue([]);
  });

  it("returns ok with no previous data", async () => {
    const { detectContagion } = await import("../../jobs/contagionEngine.js");
    const result = detectContagion(0);
    expect(result.ok).toBe(true);
    expect(result.co.length).toBe(0);
  });

  it("returns valid result structure", async () => {
    const { detectContagion } = await import("../../jobs/contagionEngine.js");
    const result = detectContagion(0);
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("co");
    expect(result).toHaveProperty("ci");
  });
});

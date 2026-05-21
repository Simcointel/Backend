import { describe, it, expect, vi, beforeEach } from "vitest";
import { CATEGORIES } from "../helpers/mockData.js";

const mockLoadLatestMomentum = vi.fn();
const mockLoadLatestStress = vi.fn();
const mockLoadLatestRegime = vi.fn();
const mockLoadLatestDivergence = vi.fn();

vi.mock("../../jobs/relationalUtils.js", () => ({
  loadLatestMomentum: mockLoadLatestMomentum,
  loadLatestStress: mockLoadLatestStress,
  loadLatestRegime: mockLoadLatestRegime,
  loadLatestDivergence: mockLoadLatestDivergence,
  getCategories: vi.fn(() => CATEGORIES),
  makeEventId: vi.fn(() => "test-event-id"),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

vi.mock("../../jobs/intelligenceUtils.js", () => ({
  loadInflationHistory: vi.fn(() => []),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

describe("divergenceEngine", () => {
  beforeEach(() => {
    mockLoadLatestMomentum.mockReset();
    mockLoadLatestStress.mockReset();
    mockLoadLatestRegime.mockReset();
    mockLoadLatestDivergence.mockReset();
    mockLoadLatestMomentum.mockReturnValue(null);
    mockLoadLatestStress.mockReturnValue(null);
    mockLoadLatestRegime.mockReturnValue(null);
    mockLoadLatestDivergence.mockReturnValue(null);
  });

  it("returns ok with no previous momentum", async () => {
    const { detectDivergences } = await import("../../jobs/divergenceEngine.js");
    const result = detectDivergences(0);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Array.isArray(result.di)).toBe(true);
  });

  it("returns ok when momentum has data", async () => {
    mockLoadLatestMomentum.mockReturnValue(
      Object.fromEntries(CATEGORIES.map((c) => [c, { st: 0.5, mt: 0.3, ac: 0.8, ts: 0.6 }]))
    );
    const { detectDivergences } = await import("../../jobs/divergenceEngine.js");
    const result = detectDivergences(0);
    expect(result.ok).toBe(true);
  });

  it("all divergence values are finite when data available", async () => {
    mockLoadLatestMomentum.mockReturnValue(
      Object.fromEntries(CATEGORIES.map((c) => [c, { st: 0.5, mt: 0.3, ac: 0.8, ts: 0.6 }]))
    );
    const { detectDivergences } = await import("../../jobs/divergenceEngine.js");
    const result = detectDivergences(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const d of result.di) expect(Number.isFinite(d.st)).toBe(true);
    }
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateIndexHistory, injectIndexSpike, CATEGORIES } from "../helpers/mockData.js";

const mockLoadIndexHistory = vi.fn();
vi.mock("../../jobs/intelligenceUtils.js", () => ({
  loadIndexHistory: mockLoadIndexHistory,
  getCategoryNames: vi.fn(() => Object.fromEntries(CATEGORIES.map((c) => [c, c]))),
  getDataRoot: vi.fn(() => "/tmp/test"),
}));

describe("momentumEngine", () => {
  beforeEach(() => {
    mockLoadIndexHistory.mockReset();
  });

  it("returns ok for sufficient history", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 30));
    const { computeMomentum } = await import("../../jobs/momentumEngine.js");
    const result = computeMomentum(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.momentum).length).toBeGreaterThan(0);
    }
  });

  it("returns ok=false for insufficient history", async () => {
    mockLoadIndexHistory.mockReturnValue([]);
    const { computeMomentum } = await import("../../jobs/momentumEngine.js");
    const result = computeMomentum(0);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("insufficient");
  });

  it("handles price spike without NaN", async () => {
    const history = generateIndexHistory(0, 30);
    injectIndexSpike(history, "energy-fuel", 15, 5);
    mockLoadIndexHistory.mockReturnValue(history);
    const { computeMomentum } = await import("../../jobs/momentumEngine.js");
    const result = computeMomentum(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const cat of Object.values(result.momentum)) {
        expect(Number.isFinite(cat.st)).toBe(true);
        expect(Number.isFinite(cat.mt)).toBe(true);
      }
    }
  });

  it("momentum values are finite for all categories", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 60));
    const { computeMomentum } = await import("../../jobs/momentumEngine.js");
    const result = computeMomentum(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const [cat, m] of Object.entries(result.momentum)) {
        expect(Number.isFinite(m.st), `${cat}.st`).toBe(true);
        expect(Number.isFinite(m.mt), `${cat}.mt`).toBe(true);
      }
    }
  });

  it("only one snapshot returns insufficient history", async () => {
    mockLoadIndexHistory.mockReturnValue(generateIndexHistory(0, 1));
    const { computeMomentum } = await import("../../jobs/momentumEngine.js");
    const result = computeMomentum(0);
    expect(result.ok).toBe(false);
  });
});

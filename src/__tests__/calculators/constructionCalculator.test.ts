import { describe, it, expect } from "vitest";
import { calculateConstruction } from "../../calculators/constructionCalculator.js";

describe("constructionCalculator", () => {
  it("produces deterministic results for same input", () => {
    const input = {
      buildingId: "G",
      currentLevel: 1,
      targetLevel: 5,
      abundance: 100,
    };

    const result1 = calculateConstruction(input);
    const result2 = calculateConstruction(input);

    expect(result1.totalCost).toBe(result2.totalCost);
    expect(result1.costPerLevel).toEqual(result2.costPerLevel);
    expect(result1.roiDays).toBe(result2.roiDays);
  });

  it("calculates cost per level correctly", () => {
    const input = {
      buildingId: "G",
      currentLevel: 1,
      targetLevel: 3,
      abundance: 100,
    };

    const result = calculateConstruction(input);

    expect(result.costPerLevel.length).toBe(2);
    expect(result.totalCost).toBe(result.costPerLevel.reduce((a, b) => a + b, 0));
    expect(result.costPerLevel[1]).toBeGreaterThan(result.costPerLevel[0]);
  });

  it("handles single level upgrade", () => {
    const input = {
      buildingId: "G",
      currentLevel: 5,
      targetLevel: 6,
      abundance: 100,
    };

    const result = calculateConstruction(input);

    expect(result.costPerLevel.length).toBe(1);
    expect(result.totalCost).toBe(result.costPerLevel[0]);
  });

  it("returns zero for invalid level range", () => {
    const input = {
      buildingId: "G",
      currentLevel: 5,
      targetLevel: 5,
      abundance: 100,
    };

    const result = calculateConstruction(input);

    expect(result.totalCost).toBe(0);
    expect(result.costPerLevel.length).toBe(0);
    expect(result.roiDays).toBe(0);
  });

  it("calculates ROI days", () => {
    const input = {
      buildingId: "G",
      currentLevel: 1,
      targetLevel: 5,
      abundance: 100,
    };

    const result = calculateConstruction(input);

    expect(result.roiDays).toBeGreaterThanOrEqual(0);
    expect(result.dailyProfitIncrease).toBeGreaterThanOrEqual(0);
  });

  it("throws for unknown building", () => {
    const input = {
      buildingId: "UNKNOWN",
      currentLevel: 1,
      targetLevel: 5,
      abundance: 100,
    };

    expect(() => calculateConstruction(input)).toThrow("Unknown building: UNKNOWN");
  });
});
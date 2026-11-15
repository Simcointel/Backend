import { describe, it, expect } from "vitest";
import { calculateProduction } from "../../calculators/productionCalculator.js";

describe("productionCalculator", () => {
  it("produces deterministic results for same input", () => {
    const input = {
      buildingId: "G",
      productId: 3,
      quality: 0,
      buildingLevel: 5,
      prodBonus: 10,
      researchBonus: 5,
      abundance: 100,
      wages: 1000,
      inputCosts: 500,
      transport: 50,
      vwap: 8.0,
    };

    const result1 = calculateProduction(input);
    const result2 = calculateProduction(input);

    expect(result1.unitsPerHour).toBe(result2.unitsPerHour);
    expect(result1.revenuePerHour).toBe(result2.revenuePerHour);
    expect(result1.profitPerHour).toBe(result2.profitPerHour);
    expect(result1.marginPct).toBe(result2.marginPct);
  });

  it("calculates profit correctly", () => {
    const input = {
      buildingId: "G",
      productId: 3,
      quality: 0,
      buildingLevel: 1,
      prodBonus: 0,
      researchBonus: 0,
      abundance: 100,
      wages: 1000,
      inputCosts: 500,
      transport: 50,
      vwap: 10.0,
    };

    const result = calculateProduction(input);

    expect(result.unitsPerHour).toBeGreaterThan(0);
    expect(result.revenuePerHour).toBe(result.unitsPerHour * input.vwap);
    expect(result.costPerHour).toBe(input.inputCosts + input.wages + input.transport);
    expect(result.profitPerHour).toBe(result.revenuePerHour - result.costPerHour);
    expect(result.marginPct).toBeCloseTo((result.profitPerHour / result.revenuePerHour) * 100, 1);
    expect(result.breakEvenPrice).toBeCloseTo(result.costPerHour / result.unitsPerHour, 2);
  });

  it("scales with building level", () => {
    const baseInput = {
      buildingId: "G",
      productId: 3,
      quality: 0,
      prodBonus: 0,
      researchBonus: 0,
      abundance: 100,
      wages: 1000,
      inputCosts: 500,
      transport: 50,
      vwap: 10.0,
    };

    const level1 = calculateProduction({ ...baseInput, buildingLevel: 1 });
    const level5 = calculateProduction({ ...baseInput, buildingLevel: 5 });

    expect(level5.unitsPerHour).toBe(level1.unitsPerHour * 5);
    expect(level5.revenuePerHour).toBe(level1.revenuePerHour * 5);
  });

  it("applies production bonus correctly", () => {
    const baseInput = {
      buildingId: "G",
      productId: 3,
      quality: 0,
      buildingLevel: 1,
      researchBonus: 0,
      abundance: 100,
      wages: 1000,
      inputCosts: 500,
      transport: 50,
      vwap: 10.0,
    };

    const noBonus = calculateProduction({ ...baseInput, prodBonus: 0 });
    const withBonus = calculateProduction({ ...baseInput, prodBonus: 20 });

    expect(withBonus.unitsPerHour).toBeCloseTo(noBonus.unitsPerHour * 1.2, 1);
  });

  it("handles zero abundance", () => {
    const input = {
      buildingId: "G",
      productId: 3,
      quality: 0,
      buildingLevel: 5,
      prodBonus: 10,
      researchBonus: 5,
      abundance: 0,
      wages: 1000,
      inputCosts: 500,
      transport: 50,
      vwap: 8.0,
    };

    const result = calculateProduction(input);

    expect(result.unitsPerHour).toBe(0);
    expect(result.revenuePerHour).toBe(0);
    expect(result.profitPerHour).toBeLessThan(0);
  });
});
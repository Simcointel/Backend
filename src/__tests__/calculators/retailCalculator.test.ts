import { describe, it, expect } from "vitest";
import { calculateRetail } from "../../calculators/retailCalculator.js";
import type { PhaseCoefficients } from "../../calculators/types.js";

const mockPhaseCoeffs: PhaseCoefficients = {
  productId: 3,
  quality: 0,
  phase: "Normal",
  T: -0.0001,
  U: 0.5,
  V: 0.000001,
  W: 10,
  rSquared: 0.92,
  sampleSize: 500,
  derivedAt: new Date().toISOString(),
};

describe("retailCalculator", () => {
  it("produces deterministic results for same input", () => {
    const input = {
      buildingId: "G",
      productId: 3,
      quality: 0,
      buildingLevel: 5,
      economyPhase: "Normal" as const,
      weatherMultiplier: 1.0,
      abundance: 100,
      livePrice: 5.0,
      saturation: 1.0,
      phaseCoeffs: mockPhaseCoeffs,
    };

    const result1 = calculateRetail(input);
    const result2 = calculateRetail(input);

    expect(result1.optimalPrice).toBe(result2.optimalPrice);
    expect(result1.expectedDemand).toBe(result2.expectedDemand);
    expect(result1.expectedProfit).toBe(result2.expectedProfit);
    expect(result1.marginPct).toBe(result2.marginPct);
  });

  it("returns optimal price above live price", () => {
    const input = {
      buildingId: "G",
      productId: 3,
      quality: 0,
      buildingLevel: 5,
      economyPhase: "Normal" as const,
      weatherMultiplier: 1.0,
      abundance: 100,
      livePrice: 5.0,
      saturation: 1.0,
      phaseCoeffs: mockPhaseCoeffs,
    };

    const result = calculateRetail(input);

    expect(result.optimalPrice).toBeGreaterThan(input.livePrice);
    expect(result.optimalPrice).toBeLessThanOrEqual(input.livePrice * 3.0);
  });

  it("handles different economy phases", () => {
    const boomCoeffs: PhaseCoefficients = {
      productId: 3, quality: 0, phase: "Boom",
      T: -0.0005, U: 0.4, V: 0.0001, W: 20,
      rSquared: 0.92, sampleSize: 500, derivedAt: new Date().toISOString(),
    };
    const recessionCoeffs: PhaseCoefficients = {
      productId: 3, quality: 0, phase: "Recession",
      T: -0.0003, U: 0.2, V: 0.00005, W: 15,
      rSquared: 0.9, sampleSize: 400, derivedAt: new Date().toISOString(),
    };

    const baseInput = {
      buildingId: "G",
      productId: 3,
      quality: 0,
      buildingLevel: 5,
      weatherMultiplier: 1.0,
      abundance: 100,
      livePrice: 5.0,
      saturation: 1.0,
    };

    const boomResult = calculateRetail({ ...baseInput, economyPhase: "Boom", phaseCoeffs: boomCoeffs });
    const recessionResult = calculateRetail({ ...baseInput, economyPhase: "Recession", phaseCoeffs: recessionCoeffs });

    expect(boomResult.optimalPrice).toBeGreaterThan(baseInput.livePrice);
    expect(recessionResult.optimalPrice).toBeGreaterThan(baseInput.livePrice);
    expect(typeof boomResult.expectedProfit).toBe("number");
    expect(typeof recessionResult.expectedProfit).toBe("number");
    expect(boomResult.confidence).toBeGreaterThan(0);
    expect(recessionResult.confidence).toBeGreaterThan(0);
    expect(typeof boomResult.marginPct).toBe("number");
    expect(typeof recessionResult.marginPct).toBe("number");
  });

  it("handles saturation correctly", () => {
    const input = {
      buildingId: "G",
      productId: 3,
      quality: 0,
      buildingLevel: 5,
      economyPhase: "Normal" as const,
      weatherMultiplier: 1.0,
      abundance: 100,
      livePrice: 5.0,
      saturation: 2.0,
      phaseCoeffs: mockPhaseCoeffs,
    };

    const result = calculateRetail(input);
    expect(result.expectedDemand).toBeLessThan(calculateRetail({ ...input, saturation: 1.0 }).expectedDemand);
  });

  it("returns confidence based on coefficient freshness", () => {
    const freshCoeffs: PhaseCoefficients = { ...mockPhaseCoeffs, derivedAt: new Date().toISOString() };
    const oldCoeffs: PhaseCoefficients = { ...mockPhaseCoeffs, derivedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() };

    const freshResult = calculateRetail({
      buildingId: "G", productId: 3, quality: 0, buildingLevel: 5,
      economyPhase: "Normal", weatherMultiplier: 1.0, abundance: 100,
      livePrice: 5.0, saturation: 1.0, phaseCoeffs: freshCoeffs,
    });

    const oldResult = calculateRetail({
      buildingId: "G", productId: 3, quality: 0, buildingLevel: 5,
      economyPhase: "Normal", weatherMultiplier: 1.0, abundance: 100,
      livePrice: 5.0, saturation: 1.0, phaseCoeffs: oldCoeffs,
    });

    expect(freshResult.confidence).toBeGreaterThan(oldResult.confidence);
  });
});
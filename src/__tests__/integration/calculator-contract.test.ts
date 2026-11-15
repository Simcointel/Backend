import { describe, it, expect, beforeEach, vi } from "vitest";
import { calculateRetail } from "../../calculators/retailCalculator.js";
import { calculateProduction } from "../../calculators/productionCalculator.js";
import { calculateConstruction } from "../../calculators/constructionCalculator.js";
import { calculateExecutive } from "../../calculators/executiveCalculator.js";
import { calculateXP } from "../../calculators/xpCalculator.js";
import type { PhaseCoefficients } from "../../calculators/types.js";

const mockPhaseCoeffs: PhaseCoefficients = {
  productId: 3,
  quality: 0,
  phase: "Normal",
  T: -0.0005,
  U: 0.4,
  V: 0.0001,
  W: 20,
  rSquared: 0.92,
  sampleSize: 500,
  derivedAt: new Date().toISOString(),
};

describe("Integration: Calculator Contract Tests", () => {
  describe("Retail Calculator Contract", () => {
    it("returns valid RetailCalculatorResult for valid input", () => {
      const input = {
        buildingId: "G",
        productId: 3,
        quality: 0,
        buildingLevel: 5,
        economyPhase: "Normal" as const,
        weatherMultiplier: 1.012,
        abundance: 100,
        livePrice: 5.0,
        saturation: 1.0,
        phaseCoeffs: mockPhaseCoeffs,
      };

      const result = calculateRetail(input);

      // Contract: required fields present
      expect(result).toHaveProperty("optimalPrice");
      expect(result).toHaveProperty("expectedDemand");
      expect(result).toHaveProperty("expectedRevenue");
      expect(result).toHaveProperty("expectedProfit");
      expect(result).toHaveProperty("marginPct");
      expect(result).toHaveProperty("confidence");
      expect(result).toHaveProperty("priceRange");
      expect(result).toHaveProperty("input");

      // Contract: types correct
      expect(typeof result.optimalPrice).toBe("number");
      expect(typeof result.expectedDemand).toBe("number");
      expect(typeof result.expectedRevenue).toBe("number");
      expect(typeof result.expectedProfit).toBe("number");
      expect(typeof result.marginPct).toBe("number");
      expect(typeof result.confidence).toBe("number");
      expect(typeof result.priceRange.min).toBe("number");
      expect(typeof result.priceRange.max).toBe("number");

      // Contract: price bounds
      expect(result.optimalPrice).toBeGreaterThan(input.livePrice);
      expect(result.optimalPrice).toBeLessThanOrEqual(input.livePrice * 3.0);
      expect(result.priceRange.min).toBe(input.livePrice * 1.01);
      expect(result.priceRange.max).toBe(input.livePrice * 3.0);

      // Contract: confidence in range
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("produces deterministic results", () => {
      const input = {
        buildingId: "G",
        productId: 3,
        quality: 0,
        buildingLevel: 5,
        economyPhase: "Normal" as const,
        weatherMultiplier: 1.012,
        abundance: 100,
        livePrice: 5.0,
        saturation: 1.0,
        phaseCoeffs: mockPhaseCoeffs,
      };

      const r1 = calculateRetail(input);
      const r2 = calculateRetail(input);

      expect(r1.optimalPrice).toBe(r2.optimalPrice);
      expect(r1.expectedDemand).toBe(r2.expectedDemand);
      expect(r1.expectedProfit).toBe(r2.expectedProfit);
    });

    it("handles different economy phases", () => {
      const boomCoeffs: PhaseCoefficients = { ...mockPhaseCoeffs, phase: "Boom", U: 1.0, W: 60 };
      const recessionCoeffs: PhaseCoefficients = { ...mockPhaseCoeffs, phase: "Recession", U: 0.2, W: 40 };

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

      const boomResult = calculateRetail({ ...baseInput, economyPhase: "Boom" as const, phaseCoeffs: boomCoeffs });
      const recessionResult = calculateRetail({ ...baseInput, economyPhase: "Recession" as const, phaseCoeffs: recessionCoeffs });

      expect(boomResult.optimalPrice).toBeGreaterThan(0);
      expect(recessionResult.optimalPrice).toBeGreaterThan(0);
    });
  });

  describe("Production Calculator Contract", () => {
    it("returns valid ProductionCalcOutput for valid input", () => {
      const input = {
        buildingId: "G",
        productId: 3,
        quality: 0,
        buildingLevel: 1,
        prodBonus: 10,
        researchBonus: 5,
        abundance: 100,
        wages: 1000,
        inputCosts: 500,
        transport: 50,
        vwap: 8.0,
      };

      const result = calculateProduction(input);

      // Contract: required fields present
      expect(result).toHaveProperty("unitsPerHour");
      expect(result).toHaveProperty("revenuePerHour");
      expect(result).toHaveProperty("costPerHour");
      expect(result).toHaveProperty("profitPerHour");
      expect(result).toHaveProperty("marginPct");
      expect(result).toHaveProperty("breakEvenPrice");
      expect(result).toHaveProperty("meta");

      // Contract: types correct
      expect(typeof result.unitsPerHour).toBe("number");
      expect(typeof result.revenuePerHour).toBe("number");
      expect(typeof result.costPerHour).toBe("number");
      expect(typeof result.profitPerHour).toBe("number");
      expect(typeof result.marginPct).toBe("number");
      expect(typeof result.breakEvenPrice).toBe("number");

      // Contract: math consistency
      expect(result.revenuePerHour).toBeCloseTo(result.unitsPerHour * input.vwap, 1);
      expect(result.costPerHour).toBeCloseTo(input.inputCosts + input.wages + input.transport, 1);
      expect(result.profitPerHour).toBeCloseTo(result.revenuePerHour - result.costPerHour, 1);
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

      expect(level5.unitsPerHour).toBeCloseTo(level1.unitsPerHour * 5, 1);
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
  });

  describe("Construction Calculator Contract", () => {
    it("returns valid ConstructionCalcOutput for valid input", () => {
      const input = {
        buildingId: "G",
        currentLevel: 1,
        targetLevel: 5,
        abundance: 100,
      };

      const result = calculateConstruction(input);

      // Contract: required fields present
      expect(result).toHaveProperty("totalCost");
      expect(result).toHaveProperty("costPerLevel");
      expect(result).toHaveProperty("roiDays");
      expect(result).toHaveProperty("dailyProfitIncrease");
      expect(result).toHaveProperty("meta");

      // Contract: types correct
      expect(typeof result.totalCost).toBe("number");
      expect(Array.isArray(result.costPerLevel)).toBe(true);
      expect(typeof result.roiDays).toBe("number");
      expect(typeof result.dailyProfitIncrease).toBe("number");

      // Contract: cost per level matches
      expect(result.totalCost).toBe(result.costPerLevel.reduce((a, b) => a + b, 0));
      expect(result.costPerLevel.length).toBe(input.targetLevel - input.currentLevel);
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

  describe("Executive Calculator Contract", () => {
    it("returns valid ExecutiveCalcOutput for valid input", () => {
      const input = {
        totalBuildingLevels: 50,
        cooManagement: 10, cfoManagement: 5, cmoManagement: 5, ctoManagement: 5,
        cooAccounting: 5, cfoAccounting: 10, cmoAccounting: 5, ctoAccounting: 5,
        cooCommunication: 5, cfoCommunication: 5, cmoCommunication: 10, ctoCommunication: 5,
        cooScience: 5, cfoScience: 5, cmoScience: 5, ctoScience: 10,
        bankLevel: 0,
        dailyProfit: 500000,
        startQ: 0,
        targetQ: 5,
      };

      const result = calculateExecutive(input);

      // Contract: required fields present
      expect(result).toHaveProperty("adminOverhead");
      expect(result).toHaveProperty("taxThreshold");
      expect(result).toHaveProperty("dailyTax");
      expect(result).toHaveProperty("salesSpeedBonus");
      expect(result).toHaveProperty("patentProbability");
      expect(result).toHaveProperty("researchCost");
      expect(result).toHaveProperty("effectiveManagement");
      expect(result).toHaveProperty("maxAccounting");
      expect(result).toHaveProperty("totalCommunication");
      expect(result).toHaveProperty("maxScience");
      expect(result).toHaveProperty("avgScience");
      expect(result).toHaveProperty("meta");

      // Contract: types correct
      expect(typeof result.adminOverhead).toBe("number");
      expect(typeof result.taxThreshold).toBe("number");
      expect(typeof result.dailyTax).toBe("number");
      expect(typeof result.salesSpeedBonus).toBe("number");
      expect(typeof result.patentProbability).toBe("number");
      expect(typeof result.researchCost).toBe("number");

      // Contract: admin overhead bounds
      expect(result.adminOverhead).toBeGreaterThanOrEqual(0);
      expect(result.adminOverhead).toBeLessThanOrEqual(100);

      // Contract: tax threshold minimum
      expect(result.taxThreshold).toBeGreaterThanOrEqual(3_000_000);
    });

    it("reduces admin overhead with management skills", () => {
      const lowMgmt = {
        totalBuildingLevels: 100,
        cooManagement: 0, cfoManagement: 0, cmoManagement: 0, ctoManagement: 0,
        cooAccounting: 0, cfoAccounting: 0, cmoAccounting: 0, ctoAccounting: 0,
        cooCommunication: 0, cfoCommunication: 0, cmoCommunication: 0, ctoCommunication: 0,
        cooScience: 0, cfoScience: 0, cmoScience: 0, ctoScience: 0,
        bankLevel: 0, dailyProfit: 500000, startQ: 0, targetQ: 0,
      };

      const highMgmt = {
        ...lowMgmt,
        cooManagement: 100, cfoManagement: 100, cmoManagement: 100, ctoManagement: 100,
      };

      const lowResult = calculateExecutive(lowMgmt);
      const highResult = calculateExecutive(highMgmt);

      expect(highResult.adminOverhead).toBeLessThan(lowResult.adminOverhead);
    });
  });

  describe("XP Calculator Contract", () => {
    it("returns valid XPCalcOutput for produce operation", () => {
      const input = { operationType: "produce" as const, buildingLevel: 10, quality: 2, quantity: 100 };
      const result = calculateXP(input);

      expect(result).toHaveProperty("xpGained");
      expect(result).toHaveProperty("breakdown");
      expect(result).toHaveProperty("meta");
      expect(typeof result.xpGained).toBe("number");
      expect(typeof result.breakdown).toBe("object");
      expect(result.breakdown.baseXP).toBeGreaterThan(0);
      expect(result.breakdown.qualityMultiplier).toBeGreaterThan(1);
    });

    it("scales XP with quantity for produce", () => {
      const base = { operationType: "produce" as const, buildingLevel: 10, quality: 0, quantity: 1 };
      const q10 = { operationType: "produce" as const, buildingLevel: 10, quality: 0, quantity: 10 };

      const baseResult = calculateXP(base);
      const q10Result = calculateXP(q10);

      expect(q10Result.xpGained).toBe(baseResult.xpGained * 10);
    });

    it("calculates research XP correctly", () => {
      const input = { operationType: "research" as const, buildingLevel: 5, quality: 3 };
      const result = calculateXP(input);

      expect(result.breakdown.baseXP).toBeGreaterThan(0);
      expect(result.breakdown.levelMultiplier).toBeCloseTo(1.25, 2);
    });

    it("calculates prospect XP correctly", () => {
      const input = { operationType: "prospect" as const, buildingLevel: 5, quality: 0 };
      const result = calculateXP(input);

      expect(result.breakdown.baseXP).toBe(100);
      expect(result.breakdown.levelMultiplier).toBe(5);
      expect(result.xpGained).toBe(500);
    });

    it("calculates upgrade XP correctly", () => {
      const input = { operationType: "upgrade" as const, buildingLevel: 10, quality: 0 };
      const result = calculateXP(input);

      expect(result.breakdown.baseXP).toBeGreaterThan(0);
      expect(result.xpGained).toBe(result.breakdown.baseXP);
    });
  });
});
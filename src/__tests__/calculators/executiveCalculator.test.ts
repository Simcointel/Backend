import { describe, it, expect } from "vitest";
import { calculateExecutive } from "../../calculators/executiveCalculator.js";

describe("executiveCalculator", () => {
  it("produces deterministic results for same input", () => {
    const input = {
      totalBuildingLevels: 50,
      cooManagement: 10, cfoManagement: 5, cmoManagement: 5, ctoManagement: 5,
      cooAccounting: 5, cfoAccounting: 10, cmoAccounting: 5, ctoAccounting: 5,
      cooCommunication: 5, cfoCommunication: 5, cmoCommunication: 10, ctoCommunication: 5,
      cooScience: 5, cfoScience: 5, cmoScience: 5, ctoScience: 10,
      bankLevel: 0,
      dailyProfit: 500000,
      startQ: 0,
      targetQ: 1,
    };

    const result1 = calculateExecutive(input);
    const result2 = calculateExecutive(input);

    expect(result1.adminOverhead).toBe(result2.adminOverhead);
    expect(result1.taxThreshold).toBe(result2.taxThreshold);
    expect(result1.dailyTax).toBe(result2.dailyTax);
    expect(result1.patentProbability).toBe(result2.patentProbability);
    expect(result1.researchCost).toBe(result2.researchCost);
  });

  it("calculates admin overhead correctly", () => {
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
    expect(lowResult.adminOverhead).toBeCloseTo((99 / 170) * 100, 1);
  });

  it("calculates tax threshold from accounting", () => {
    const baseInput = {
      totalBuildingLevels: 50,
      cooManagement: 10, cfoManagement: 5, cmoManagement: 5, ctoManagement: 5,
      cooAccounting: 5, cfoAccounting: 5, cmoAccounting: 5, ctoAccounting: 5,
      cooCommunication: 5, cfoCommunication: 5, cmoCommunication: 5, ctoCommunication: 5,
      cooScience: 5, cfoScience: 5, cmoScience: 5, ctoScience: 5,
      bankLevel: 0, dailyProfit: 500000, startQ: 0, targetQ: 0,
    };

    const lowAcc = calculateExecutive({ ...baseInput, cooAccounting: 0, cfoAccounting: 0, cmoAccounting: 0, ctoAccounting: 0 });
    const highAcc = calculateExecutive({ ...baseInput, cooAccounting: 100, cfoAccounting: 100, cmoAccounting: 100, ctoAccounting: 100 });

    expect(highAcc.taxThreshold).toBeGreaterThan(lowAcc.taxThreshold);
    expect(lowAcc.taxThreshold).toBe(3_000_000);
    expect(highAcc.taxThreshold).toBe(3_000_000 + 75 * 5_500_000); // eff(100) = 70 + (100-80)/4 = 75
  });

  it("calculates daily tax correctly", () => {
    const input = {
      totalBuildingLevels: 50,
      cooManagement: 10, cfoManagement: 5, cmoManagement: 5, ctoManagement: 5,
      cooAccounting: 10, cfoAccounting: 5, cmoAccounting: 5, ctoAccounting: 5,
      cooCommunication: 5, cfoCommunication: 5, cmoCommunication: 5, ctoCommunication: 5,
      cooScience: 5, cfoScience: 5, cmoScience: 5, ctoScience: 5,
      bankLevel: 0,
      dailyProfit: 5_000_000,
      startQ: 0,
      targetQ: 0,
    };

    const result = calculateExecutive(input);

    const threshold = result.taxThreshold;
    const dailyThreshold = threshold / 30;
    const expectedTax = Math.max(0, input.dailyProfit - dailyThreshold) * 0.07;
    expect(result.dailyTax).toBeCloseTo(expectedTax, 0);
  });

  it("reduces tax with bank level", () => {
    const baseInput = {
      totalBuildingLevels: 50,
      cooManagement: 10, cfoManagement: 5, cmoManagement: 5, ctoManagement: 5,
      cooAccounting: 10, cfoAccounting: 5, cmoAccounting: 5, ctoAccounting: 5,
      cooCommunication: 5, cfoCommunication: 5, cmoCommunication: 5, ctoCommunication: 5,
      cooScience: 5, cfoScience: 5, cmoScience: 5, ctoScience: 5,
      dailyProfit: 5_000_000,
      startQ: 0,
      targetQ: 0,
    };

    const noBank = calculateExecutive({ ...baseInput, bankLevel: 0 });
    const withBank = calculateExecutive({ ...baseInput, bankLevel: 10 });

    expect(withBank.dailyTax).toBeLessThanOrEqual(noBank.dailyTax);
  });

  it("calculates sales speed from communication", () => {
    const baseInput = {
      totalBuildingLevels: 50,
      cooManagement: 10, cfoManagement: 5, cmoManagement: 5, ctoManagement: 5,
      cooAccounting: 10, cfoAccounting: 5, cmoAccounting: 5, ctoAccounting: 5,
      cooScience: 5, cfoScience: 5, cmoScience: 5, ctoScience: 5,
      bankLevel: 0, dailyProfit: 500000, startQ: 0, targetQ: 0,
    };

    const lowComm = calculateExecutive({ ...baseInput, cooCommunication: 0, cfoCommunication: 0, cmoCommunication: 0, ctoCommunication: 0 });
    const highComm = calculateExecutive({ ...baseInput, cooCommunication: 100, cfoCommunication: 100, cmoCommunication: 100, ctoCommunication: 100 });

    expect(highComm.salesSpeedBonus).toBeGreaterThan(lowComm.salesSpeedBonus);
    expect(lowComm.salesSpeedBonus).toBe(0);
  });

  it("calculates patent probability from science", () => {
    const baseInput = {
      totalBuildingLevels: 50,
      cooManagement: 10, cfoManagement: 5, cmoManagement: 5, ctoManagement: 5,
      cooAccounting: 10, cfoAccounting: 5, cmoAccounting: 5, ctoAccounting: 5,
      cooCommunication: 5, cfoCommunication: 5, cmoCommunication: 5, ctoCommunication: 5,
      bankLevel: 0, dailyProfit: 500000, startQ: 0, targetQ: 0,
    };

    const lowSci = calculateExecutive({ ...baseInput, cooScience: 0, cfoScience: 0, cmoScience: 0, ctoScience: 0 });
    const highSci = calculateExecutive({ ...baseInput, cooScience: 100, cfoScience: 100, cmoScience: 100, ctoScience: 100 });

    expect(highSci.patentProbability).toBeGreaterThan(lowSci.patentProbability);
    expect(lowSci.patentProbability).toBeCloseTo(6.25, 1);
  });

  it("calculates research cost correctly", () => {
    const baseInput = {
      totalBuildingLevels: 50,
      cooManagement: 10, cfoManagement: 5, cmoManagement: 5, ctoManagement: 5,
      cooAccounting: 10, cfoAccounting: 5, cmoAccounting: 5, ctoAccounting: 5,
      cooCommunication: 5, cfoCommunication: 5, cmoCommunication: 5, ctoCommunication: 5,
      cooScience: 50, cfoScience: 50, cmoScience: 50, ctoScience: 50,
      bankLevel: 0, dailyProfit: 500000,
      startQ: 0,
      targetQ: 5,
    };

    const result = calculateExecutive(baseInput);

    expect(result.researchCost).toBeGreaterThan(0);
    expect(result.researchCost).toBeCloseTo(5 * 50 * Math.max(1, 10 - 50 * 0.5), 0);
  });

  it("returns zero research cost when target <= start", () => {
    const input = {
      totalBuildingLevels: 50,
      cooManagement: 10, cfoManagement: 5, cmoManagement: 5, ctoManagement: 5,
      cooAccounting: 10, cfoAccounting: 5, cmoAccounting: 5, ctoAccounting: 5,
      cooCommunication: 5, cfoCommunication: 5, cmoCommunication: 5, ctoCommunication: 5,
      cooScience: 50, cfoScience: 50, cmoScience: 50, ctoScience: 50,
      bankLevel: 0, dailyProfit: 500000,
      startQ: 5,
      targetQ: 3,
    };

    const result = calculateExecutive(input);

    expect(result.researchCost).toBe(0);
  });
});
import { BUILDINGS, getBuilding } from "../data/cooperinc-static.js";
import type { ProductionCalcInput, ProductionCalcOutput, CalculatorMeta } from "./types.js";

const RESOURCE_BASE_PH: Record<number, number> = {
  1: 20, 2: 20, 3: 10, 4: 15, 5: 10, 6: 8, 7: 5,
  8: 8, 9: 10, 10: 12, 11: 15, 12: 10, 13: 20, 14: 5,
  15: 4, 16: 6, 17: 5, 18: 8, 19: 7, 20: 6, 21: 10, 22: 4,
  23: 3, 24: 2, 25: 2, 26: 2, 27: 2, 28: 2, 29: 1, 30: 2,
  31: 1, 32: 1, 33: 0.5, 34: 0.5, 35: 0.5,
};

export function calculateProduction(input: ProductionCalcInput): ProductionCalcOutput & { meta: CalculatorMeta } {
  const basePh = RESOURCE_BASE_PH[input.productId] ?? 10;
  const effectivePh = basePh *
    (1 + input.prodBonus / 100) *
    (1 + input.researchBonus / 100) *
    (input.abundance / 100) *
    input.buildingLevel;

  const revenue = effectivePh * input.vwap;
  const cost = input.inputCosts + input.wages + input.transport;
  const profit = revenue - cost;

  return {
    unitsPerHour: Math.round(effectivePh * 100) / 100,
    revenuePerHour: Math.round(revenue * 100) / 100,
    costPerHour: Math.round(cost * 100) / 100,
    profitPerHour: Math.round(profit * 100) / 100,
    marginPct: revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0,
    breakEvenPrice: effectivePh > 0 ? Math.round((cost / effectivePh) * 100) / 100 : 0,
    meta: {
      calculator: "productionCalculator",
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
    },
  };
}
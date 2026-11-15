import { BUILDINGS, getBuilding } from "../data/cooperinc-static.js";
import type { ConstructionCalcInput, ConstructionCalcOutput, CalculatorMeta } from "./types.js";

export function calculateConstruction(input: ConstructionCalcInput): ConstructionCalcOutput & { meta: CalculatorMeta } {
  const building = getBuilding(input.buildingId);
  if (!building) {
    throw new Error(`Unknown building: ${input.buildingId}`);
  }

  const costPerLevel: number[] = [];
  let totalCost = 0;

  for (let level = input.currentLevel + 1; level <= input.targetLevel; level++) {
    const cost = building.baseWage * 1000 * Math.pow(1.15, level - 1);
    costPerLevel.push(Math.round(cost));
    totalCost += cost;
  }

  const dailyProfitIncrease = costPerLevel.length > 0 ? costPerLevel[costPerLevel.length - 1] * 0.1 : 0;
  const roiDays = dailyProfitIncrease > 0 ? Math.round(totalCost / dailyProfitIncrease) : 0;

  return {
    totalCost: Math.round(totalCost),
    costPerLevel: costPerLevel.map(c => Math.round(c)),
    roiDays,
    dailyProfitIncrease: Math.round(dailyProfitIncrease),
    meta: {
      calculator: "constructionCalculator",
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
    },
  };
}
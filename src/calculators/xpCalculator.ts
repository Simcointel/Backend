import type { XPCalcInput, XPCalcOutput, CalculatorMeta } from "./types.js";

const XP_TABLE: Record<number, number> = {
  1: 0, 2: 100, 3: 300, 4: 600, 5: 1000, 6: 1500, 7: 2100, 8: 2800, 9: 3600, 10: 4500,
  11: 5500, 12: 6600, 13: 7800, 14: 9100, 15: 10500, 16: 12000, 17: 13600, 18: 15300, 19: 17100, 20: 19000,
  21: 21000, 22: 23100, 23: 25300, 24: 27600, 25: 30000, 26: 32500, 27: 35100, 28: 37800, 29: 40600, 30: 43500,
  31: 46500, 32: 49600, 33: 52800, 34: 56100, 35: 59500, 36: 63000, 37: 66600, 38: 70300, 39: 74100, 40: 78000,
  41: 82000, 42: 86100, 43: 90300, 44: 94600, 45: 99000, 46: 103500, 47: 108100, 48: 112800, 49: 117600, 50: 122500,
};

const OP_XP_PER_LEVEL: Record<number, number> = {
  1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 60, 7: 70, 8: 80, 9: 90, 10: 100,
  11: 110, 12: 120, 13: 130, 14: 140, 15: 150, 16: 160, 17: 170, 18: 180, 19: 190, 20: 200,
};

const REC_XP_PER_QUALITY: Record<number, number> = {
  0: 5, 1: 10, 2: 20, 3: 35, 4: 55, 5: 80, 6: 110, 7: 145, 8: 185, 9: 230, 10: 280,
};

const PROSPECT_XP_BASE = 100;

export function calculateXP(input: XPCalcInput): XPCalcOutput & { meta: CalculatorMeta } {
  const breakdown: Record<string, number> = {};
  let xpGained = 0;

  switch (input.operationType) {
    case "produce": {
      const baseXP = XP_TABLE[input.buildingLevel] ?? 0;
      const qualityMultiplier = 1 + input.quality * 0.1;
      const quantity = input.quantity ?? 1;
      xpGained = Math.round(baseXP * qualityMultiplier * quantity);
      breakdown.baseXP = baseXP;
      breakdown.qualityMultiplier = qualityMultiplier;
      breakdown.quantity = quantity;
      break;
    }
    case "research": {
      const baseXP = REC_XP_PER_QUALITY[input.quality] ?? 0;
      const levelMultiplier = 1 + input.buildingLevel * 0.05;
      xpGained = Math.round(baseXP * levelMultiplier);
      breakdown.baseXP = baseXP;
      breakdown.levelMultiplier = levelMultiplier;
      break;
    }
    case "prospect": {
      xpGained = PROSPECT_XP_BASE * input.buildingLevel;
      breakdown.baseXP = PROSPECT_XP_BASE;
      breakdown.levelMultiplier = input.buildingLevel;
      break;
    }
    case "upgrade": {
      const baseXP = OP_XP_PER_LEVEL[input.buildingLevel] ?? 0;
      xpGained = baseXP;
      breakdown.baseXP = baseXP;
      break;
    }
  }

  return {
    xpGained,
    breakdown,
    meta: {
      calculator: "xpCalculator",
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
    },
  };
}

export { XP_TABLE, OP_XP_PER_LEVEL, REC_XP_PER_QUALITY, PROSPECT_XP_BASE };
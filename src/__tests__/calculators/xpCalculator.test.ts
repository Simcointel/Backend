import { describe, it, expect } from "vitest";
import { calculateXP, XP_TABLE, OP_XP_PER_LEVEL, REC_XP_PER_QUALITY, PROSPECT_XP_BASE } from "../../calculators/xpCalculator.js";

describe("xpCalculator", () => {
  it("produces deterministic results for same input", () => {
    const input = { operationType: "produce" as const, buildingLevel: 10, quality: 2, quantity: 100 };

    const result1 = calculateXP(input);
    const result2 = calculateXP(input);

    expect(result1.xpGained).toBe(result2.xpGained);
    expect(result1.breakdown).toEqual(result2.breakdown);
  });

  describe("produce operation", () => {
    it("calculates XP from XP_TABLE", () => {
      const input = { operationType: "produce" as const, buildingLevel: 10, quality: 0, quantity: 1 };
      const result = calculateXP(input);

      expect(result.xpGained).toBe(XP_TABLE[10]);
      expect(result.breakdown.baseXP).toBe(XP_TABLE[10]);
      expect(result.breakdown.qualityMultiplier).toBe(1.0);
    });

    it("applies quality multiplier", () => {
      const base = { operationType: "produce" as const, buildingLevel: 10, quality: 0, quantity: 1 };
      const q2 = { operationType: "produce" as const, buildingLevel: 10, quality: 2, quantity: 1 };

      const baseResult = calculateXP(base);
      const q2Result = calculateXP(q2);

      expect(q2Result.breakdown.qualityMultiplier).toBe(1.2);
      expect(q2Result.xpGained).toBe(Math.round(baseResult.xpGained * 1.2));
    });

    it("scales with quantity", () => {
      const input = { operationType: "produce" as const, buildingLevel: 10, quality: 0, quantity: 10 };
      const result = calculateXP(input);

      expect(result.breakdown.quantity).toBe(10);
      expect(result.xpGained).toBe(XP_TABLE[10] * 10);
    });
  });

  describe("research operation", () => {
    it("calculates XP from REC_XP_PER_QUALITY", () => {
      const input = { operationType: "research" as const, buildingLevel: 5, quality: 3 };
      const result = calculateXP(input);

      expect(result.breakdown.baseXP).toBe(REC_XP_PER_QUALITY[3]);
      expect(result.breakdown.levelMultiplier).toBe(1 + 5 * 0.05);
      expect(result.xpGained).toBe(Math.round(REC_XP_PER_QUALITY[3] * 1.25));
    });

    it("scales with building level", () => {
      const base = { operationType: "research" as const, buildingLevel: 1, quality: 3 };
      const higher = { operationType: "research" as const, buildingLevel: 10, quality: 3 };

      const baseResult = calculateXP(base);
      const higherResult = calculateXP(higher);

      expect(higherResult.breakdown.levelMultiplier).toBeGreaterThan(baseResult.breakdown.levelMultiplier);
      expect(higherResult.xpGained).toBeGreaterThan(baseResult.xpGained);
    });
  });

  describe("prospect operation", () => {
    it("calculates XP from PROSPECT_XP_BASE", () => {
      const input = { operationType: "prospect" as const, buildingLevel: 5, quality: 0 };
      const result = calculateXP(input);

      expect(result.breakdown.baseXP).toBe(PROSPECT_XP_BASE);
      expect(result.breakdown.levelMultiplier).toBe(5);
      expect(result.xpGained).toBe(PROSPECT_XP_BASE * 5);
    });

    it("scales linearly with building level", () => {
      const base = { operationType: "prospect" as const, buildingLevel: 1, quality: 0 };
      const higher = { operationType: "prospect" as const, buildingLevel: 10, quality: 0 };

      const baseResult = calculateXP(base);
      const higherResult = calculateXP(higher);

      expect(higherResult.xpGained).toBe(baseResult.xpGained * 10);
    });
  });

  describe("upgrade operation", () => {
    it("calculates XP from OP_XP_PER_LEVEL", () => {
      const input = { operationType: "upgrade" as const, buildingLevel: 10, quality: 0 };
      const result = calculateXP(input);

      expect(result.breakdown.baseXP).toBe(OP_XP_PER_LEVEL[10]);
      expect(result.xpGained).toBe(OP_XP_PER_LEVEL[10]);
    });
  });

  it("handles unknown building level gracefully", () => {
    const input = { operationType: "produce" as const, buildingLevel: 999, quality: 0, quantity: 1 };
    const result = calculateXP(input);

    expect(result.xpGained).toBe(0);
    expect(result.breakdown.baseXP).toBe(0);
  });
});
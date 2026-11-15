import { BUILDINGS, CORE_CONSTANTS, getBuilding } from "../data/cooperinc-static.js";
import type { PhaseCoefficients } from "./types.js";

export interface RetailCalcInput {
  buildingId: string;
  productId: number;
  quality: number;
  buildingLevel: number;
  economyPhase: "Boom" | "Normal" | "Recession";
  weatherMultiplier: number;
  abundance: number;
  livePrice: number;
  saturation: number;
  phaseCoeffs: PhaseCoefficients;
}

export interface RetailCalcOutput {
  optimalPrice: number;
  expectedDemand: number;
  expectedRevenue: number;
  expectedProfit: number;
  marginPct: number;
  confidence: number;
}

export interface RetailCalculatorResult extends RetailCalcOutput {
  input: RetailCalcInput;
  priceRange: { min: number; max: number };
}

function demand(price: number, coeffs: PhaseCoefficients): number {
  return coeffs.T * price ** 2 + coeffs.U * price + coeffs.V * price ** 3 + coeffs.W;
}

function adjustedDemand(price: number, coeffs: PhaseCoefficients, saturation: number): number {
  const baseDemand = demand(price, coeffs);
  return baseDemand / Math.max(1, saturation);
}

function profit(price: number, input: RetailCalcInput): number {
  const d = adjustedDemand(price, input.phaseCoeffs, input.saturation);
  const building = getBuilding(input.buildingId);
  const buildingWage = building?.baseWage ?? 100;
  const transport = input.livePrice * 0.02;
  const cost = input.livePrice + transport + (buildingWage / input.buildingLevel);
  return (price - cost) * d;
}

function optimizePrice(input: RetailCalcInput): { price: number; profit: number } {
  const minPrice = input.livePrice * 1.01;
  const maxPrice = input.livePrice * 3.0;

  let bestPrice = minPrice;
  let bestProfit = -Infinity;

  for (let i = 0; i <= 100; i++) {
    const price = minPrice + (maxPrice - minPrice) * (i / 100);
    const p = profit(price, input);
    if (p > bestProfit) {
      bestProfit = p;
      bestPrice = price;
    }
  }

  return { price: bestPrice, profit: bestProfit };
}

export function calculateRetail(input: RetailCalcInput): RetailCalculatorResult {
  const { price, profit: maxProfit } = optimizePrice(input);
  const expectedDemand = adjustedDemand(price, input.phaseCoeffs, input.saturation);
  const expectedRevenue = price * expectedDemand;
  const building = getBuilding(input.buildingId);
  const buildingWage = building?.baseWage ?? 100;
  const transport = input.livePrice * 0.02;
  const cost = input.livePrice + transport + (buildingWage / input.buildingLevel);
  const expectedProfit = maxProfit;
  const marginPct = cost > 0 ? ((price - cost) / price) * 100 : 0;

  const ageMinutes = (Date.now() - new Date(input.phaseCoeffs.derivedAt).getTime()) / (1000 * 60);
  const confidence = Math.max(0.1, Math.min(1, 1 - ageMinutes / (7 * 24 * 60)));

  return {
    input,
    optimalPrice: Math.round(price * 100) / 100,
    expectedDemand: Math.round(expectedDemand * 100) / 100,
    expectedRevenue: Math.round(expectedRevenue * 100) / 100,
    expectedProfit: Math.round(expectedProfit * 100) / 100,
    marginPct: Math.round(marginPct * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    priceRange: {
      min: Math.round(input.livePrice * 1.01 * 100) / 100,
      max: Math.round(input.livePrice * 3.0 * 100) / 100,
    },
  };
}
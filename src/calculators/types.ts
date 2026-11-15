export interface PhaseCoefficients {
  productId: number;
  quality: number;
  phase: "Boom" | "Normal" | "Recession";
  T: number;
  U: number;
  V: number;
  W: number;
  rSquared: number;
  sampleSize: number;
  derivedAt: string;
}

export interface ProductionCalcInput {
  buildingId: string;
  productId: number;
  quality: number;
  buildingLevel: number;
  prodBonus: number;
  researchBonus: number;
  abundance: number;
  wages: number;
  inputCosts: number;
  transport: number;
  vwap: number;
}

export interface ProductionCalcOutput {
  unitsPerHour: number;
  revenuePerHour: number;
  costPerHour: number;
  profitPerHour: number;
  marginPct: number;
  breakEvenPrice: number;
}

export interface ConstructionCalcInput {
  buildingId: string;
  currentLevel: number;
  targetLevel: number;
  abundance: number;
}

export interface ConstructionCalcOutput {
  totalCost: number;
  costPerLevel: number[];
  roiDays: number;
  dailyProfitIncrease: number;
}

export interface ExecutiveCalcInput {
  totalBuildingLevels: number;
  cooManagement: number;
  cfoManagement: number;
  cmoManagement: number;
  ctoManagement: number;
  cooAccounting: number;
  cfoAccounting: number;
  cmoAccounting: number;
  ctoAccounting: number;
  cooCommunication: number;
  cfoCommunication: number;
  cmoCommunication: number;
  ctoCommunication: number;
  cooScience: number;
  cfoScience: number;
  cmoScience: number;
  ctoScience: number;
  bankLevel: number;
  dailyProfit: number;
  startQ: number;
  targetQ: number;
}

export interface ExecutiveCalcOutput {
  adminOverhead: number;
  taxThreshold: number;
  dailyTax: number;
  salesSpeedBonus: number;
  patentProbability: number;
  researchCost: number;
  effectiveManagement: number;
  maxAccounting: number;
  totalCommunication: number;
  maxScience: number;
  avgScience: number;
}

export interface XPCalcInput {
  operationType: "produce" | "research" | "prospect" | "upgrade";
  buildingLevel: number;
  quality: number;
  quantity?: number;
}

export interface XPCalcOutput {
  xpGained: number;
  breakdown: Record<string, number>;
}

export interface CalculatorMeta {
  calculator: string;
  version: string;
  generatedAt: string;
  coefficientsVersion?: string;
}
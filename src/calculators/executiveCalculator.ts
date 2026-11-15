import type { ExecutiveCalcInput, ExecutiveCalcOutput, CalculatorMeta } from "./types.js";

function eff(v: number): number {
  if (v <= 60) return v;
  if (v <= 80) return 60 + (v - 60) / 2;
  return 70 + (v - 80) / 4;
}

export function calculateExecutive(input: ExecutiveCalcInput): ExecutiveCalcOutput & { meta: CalculatorMeta } {
  const effCooMgmt = eff(input.cooManagement);
  const effCfoMgmt = eff(input.cfoManagement);
  const effCmoMgmt = eff(input.cmoManagement);
  const effCtoMgmt = eff(input.ctoManagement);

  const effCooAcc = eff(input.cooAccounting);
  const effCfoAcc = eff(input.cfoAccounting);
  const effCmoAcc = eff(input.cmoAccounting);
  const effCtoAcc = eff(input.ctoAccounting);

  const effCooCom = eff(input.cooCommunication);
  const effCfoCom = eff(input.cfoCommunication);
  const effCmoCom = eff(input.cmoCommunication);
  const effCtoCom = eff(input.ctoCommunication);

  const effCooSci = eff(input.cooScience);
  const effCfoSci = eff(input.cfoScience);
  const effCmoSci = eff(input.cmoScience);
  const effCtoSci = eff(input.ctoScience);

  const totalMgmt = effCooMgmt + Math.floor((effCfoMgmt + effCmoMgmt + effCtoMgmt) / 4);
  const rawAO = Math.max(0, (input.totalBuildingLevels - 1) / 170);
  const adminOverhead = Math.round(rawAO * (1 - totalMgmt / 100) * 10000) / 100;

  const maxAccounting = Math.max(effCooAcc, effCfoAcc, effCmoAcc, effCtoAcc);
  const taxThreshold = 3_000_000 + maxAccounting * 5_500_000;

  const dailyThreshold = taxThreshold / 30;
  const taxableAmount = Math.max(0, input.dailyProfit - dailyThreshold);
  const dailyTax = Math.round(taxableAmount * Math.max(0.05, 0.07 - input.bankLevel * 0.001) * 100) / 100;

  const totalCommunication = effCooCom + effCfoCom + effCmoCom + effCtoCom;
  const salesSpeedBonus = Math.round((totalCommunication / 3) * 100) / 100;

  const maxScience = Math.max(effCooSci, effCfoSci, effCmoSci, effCtoSci);
  const avgScience = (effCooSci + effCfoSci + effCmoSci + effCtoSci) / 4;
  const patentProbability = Math.round((6.25 + maxScience * 0.0625) * 100) / 100;

  const researchCost = input.targetQ > input.startQ
    ? Math.round((input.targetQ - input.startQ) * 50 * Math.max(1, 10 - avgScience * 0.5) * 100) / 100
    : 0;

  return {
    adminOverhead,
    taxThreshold,
    dailyTax,
    salesSpeedBonus,
    patentProbability,
    researchCost,
    effectiveManagement: Math.round(totalMgmt),
    maxAccounting: Math.round(maxAccounting),
    totalCommunication: Math.round(totalCommunication),
    maxScience: Math.round(maxScience),
    avgScience: Math.round(avgScience * 100) / 100,
    meta: {
      calculator: "executiveCalculator",
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
    },
  };
}
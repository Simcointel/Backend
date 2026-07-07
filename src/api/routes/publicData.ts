import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve } from "path";
import { getDataRoot } from "../../jobs/intelligenceUtils.js";
import { loadConfig } from "../../config/index.js";

export interface PublicDashboard {
  scores: { eh: number; ms: number; st: number; ip: number; sr: number };
  regime: { na: string; sc: number };
  alerts: number;
  sectors: number;
  generatedAt: string;
}

export interface PublicMacro {
  realm: string;
  latest: {
    companiesValue: number | null;
    activeCompanies: number | null;
    bondsSold: number | null;
    totalBuildings: number | null;
  };
  latestIndexes: { cpi: number; coreCpi: number; gdp: number } | null;
  latestInflation: { cpiRate: number; coreCpiRate: number; gdpGrowth: number } | null;
  generatedAt: string;
}



export function loadLatestMacroData(realm: number): PublicMacro {
  const result: PublicMacro = {
    realm: String(realm),
    latest: { companiesValue: null, activeCompanies: null, bondsSold: null, totalBuildings: null },
    latestIndexes: null,
    latestInflation: null,
    generatedAt: new Date().toISOString(),
  };

  try {
    const historyDir = resolve(getDataRoot(), "aggregates", "macro", `realm-${realm}`, "history");
    if (existsSync(historyDir)) {
      const files = readdirSync(historyDir).filter((f) => f.endsWith(".json")).sort().reverse();
      if (files.length > 0) {
        const latest = JSON.parse(readFileSync(resolve(historyDir, files[0]), "utf-8"));
        result.latest.companiesValue = latest.companiesValue ?? null;
        result.latest.activeCompanies = latest.activeCompanies ?? null;
        result.latest.bondsSold = latest.bondsSold ?? null;
        result.latest.totalBuildings = latest.totalBuildings ?? null;
      }
    }

    const indexDir = resolve(getDataRoot(), "aggregates", "macro", `realm-${realm}`, "indexes");
    if (existsSync(indexDir)) {
      const files = readdirSync(indexDir).filter((f) => f.endsWith(".json")).sort().reverse();
      if (files.length > 0) {
        result.latestIndexes = JSON.parse(readFileSync(resolve(indexDir, files[0]), "utf-8"));
      }
    }

    const infDir = resolve(getDataRoot(), "aggregates", "macro", `realm-${realm}`, "inflation");
    if (existsSync(infDir)) {
      const files = readdirSync(infDir).filter((f) => f.endsWith(".json")).sort().reverse();
      if (files.length > 0) {
        result.latestInflation = JSON.parse(readFileSync(resolve(infDir, files[0]), "utf-8"));
      }
    }
  } catch { /**/ }

  return result;
}

export function loadMacroHistory(realm: number, limit = 120): { entries: unknown[]; total: number } {
  try {
    const dir = resolve(getDataRoot(), "aggregates", "macro", `realm-${realm}`, "history");
    if (!existsSync(dir)) return { entries: [], total: 0 };
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit);
    const entries = files.map((f) => {
      try { return JSON.parse(readFileSync(resolve(dir, f), "utf-8")); } catch { return null; }
    }).filter(Boolean);
    return { entries, total: entries.length };
  } catch { return { entries: [], total: 0 }; }
}

export function loadMacroIndexes(realm: number, limit = 30): { indexes: unknown[]; total: number } {
  try {
    const dir = resolve(getDataRoot(), "aggregates", "macro", `realm-${realm}`, "indexes");
    if (!existsSync(dir)) return { indexes: [], total: 0 };
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit);
    const indexes = files.map((f) => {
      try { return JSON.parse(readFileSync(resolve(dir, f), "utf-8")); } catch { return null; }
    }).filter(Boolean);
    return { indexes, total: indexes.length };
  } catch { return { indexes: [], total: 0 }; }
}

export function loadMacroInflation(realm: number, limit = 30): { inflation: unknown[]; total: number } {
  try {
    const dir = resolve(getDataRoot(), "aggregates", "macro", `realm-${realm}`, "inflation");
    if (!existsSync(dir)) return { inflation: [], total: 0 };
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit);
    const inflation = files.map((f) => {
      try { return JSON.parse(readFileSync(resolve(dir, f), "utf-8")); } catch { return null; }
    }).filter(Boolean);
    return { inflation, total: inflation.length };
  } catch { return { inflation: [], total: 0 }; }
}

export function loadMacroPhases(realm: number): { phases: unknown[]; currentPhase: string; totalDays: number } {
  try {
    const path = resolve(getDataRoot(), "aggregates", "macro", `realm-${realm}`, "phases.json");
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8"));
  } catch { /**/ }
  return { phases: [], currentPhase: "unknown", totalDays: 0 };
}



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

export function loadLastDashboardSummaries(): Record<string, PublicDashboard> {
  const result: Record<string, PublicDashboard> = {};
  const cfg = loadConfig();
  const realms = cfg.simco.realms;
  for (const realm of realms) {
    const dir = resolve(getDataRoot(), "aggregates", "dashboard");
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
    if (files.length > 0) {
      const content = JSON.parse(readFileSync(resolve(dir, files[0]), "utf-8"));
      result[`realm-${realm}`] = content;
    }
  }
  return result;
}

export function loadLastDashboardHealth(): Record<string, unknown> {
  try {
    const dir = resolve(getDataRoot(), "aggregates", "dashboard");
    if (!existsSync(dir)) return {};
    const files = readdirSync(dir).filter((f) => f.includes("health")).sort().reverse();
    if (files.length > 0) return JSON.parse(readFileSync(resolve(dir, files[0]), "utf-8"));
  } catch { /**/ }
  return {};
}

export function loadUnifiedFeed(realm: number, severity?: string, category?: string, limit = 50): { events: unknown[]; total: number } {
  try {
    const path = resolve(getDataRoot(), "aggregates", `realm-${realm}`, "events.json");
    if (!existsSync(path)) return { events: [], total: 0 };
    const content = JSON.parse(readFileSync(path, "utf-8"));
    let events = content.events ?? [];
    if (severity) events = events.filter((e: { se: string }) => e.se === severity);
    if (category) events = events.filter((e: { ca: string }) => e.ca === category);
    return { events: events.slice(0, limit), total: events.length };
  } catch { return { events: [], total: 0 }; }
}

export function loadAlertEvents(realm: number, limit = 20): { events: unknown[]; total: number } {
  try {
    const alertsDir = resolve(getDataRoot(), "alerts", "events", `realm-${realm}`);
    if (!existsSync(alertsDir)) return { events: [], total: 0 };
    const files = readdirSync(alertsDir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 3);
    const events: unknown[] = [];
    for (const f of files) {
      const content = JSON.parse(readFileSync(resolve(alertsDir, f), "utf-8"));
      if (Array.isArray(content)) events.push(...content);
    }
    return { events: events.slice(0, limit), total: events.length };
  } catch { return { events: [], total: 0 }; }
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

export function loadLatestIntelligence(): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const types = ["momentum", "volatility", "stress", "regimes", "leaders", "sectors"];
  for (const type of types) {
    try {
      const dir = resolve(getDataRoot(), "aggregates", "intelligence", type);
      if (!existsSync(dir)) continue;
      const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
      if (files.length > 0) result[type] = JSON.parse(readFileSync(resolve(dir, files[0]), "utf-8"));
    } catch { /**/ }
  }
  return result;
}

export function loadCorrelations(): unknown[] {
  try {
    const dir = resolve(getDataRoot(), "aggregates", "relational", "correlations");
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
    if (files.length > 0) return JSON.parse(readFileSync(resolve(dir, files[0]), "utf-8"));
  } catch { /**/ }
  return [];
}

export function loadAnomalies(): unknown[] {
  try {
    const dir = resolve(getDataRoot(), "aggregates", "relational", "anomalies");
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
    if (files.length > 0) return JSON.parse(readFileSync(resolve(dir, files[0]), "utf-8"));
  } catch { /**/ }
  return [];
}

export function loadDivergence(): unknown[] {
  try {
    const dir = resolve(getDataRoot(), "aggregates", "relational", "divergence");
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
    if (files.length > 0) return JSON.parse(readFileSync(resolve(dir, files[0]), "utf-8"));
  } catch { /**/ }
  return [];
}

export function loadContagion(): unknown[] {
  try {
    const dir = resolve(getDataRoot(), "aggregates", "relational", "contagion");
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
    if (files.length > 0) return JSON.parse(readFileSync(resolve(dir, files[0]), "utf-8"));
  } catch { /**/ }
  return [];
}

export function loadSectorIntelligence(): Record<string, unknown> {
  try {
    const dir = resolve(getDataRoot(), "aggregates", "intelligence", "sectors");
    if (!existsSync(dir)) return {};
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
    if (files.length > 0) return JSON.parse(readFileSync(resolve(dir, files[0]), "utf-8"));
  } catch { /**/ }
  return {};
}

function loadLatestFromSubdir(subsystem: string, realm: number): unknown {
  try {
    const dir = resolve(getDataRoot(), "aggregates", subsystem, "realm-" + realm);
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
    if (files.length === 0) return null;
    return JSON.parse(readFileSync(resolve(dir, files[0]), "utf-8"));
  } catch { return null; }
}

export function loadForecastData(realm: number): unknown { return loadLatestFromSubdir("forecasts", realm); }
export function loadSimulationData(realm: number): unknown { return loadLatestFromSubdir("simulations", realm); }
export function loadSignalData(realm: number): unknown { return loadLatestFromSubdir("signals", realm); }
export function loadCycleData(realm: number): unknown { return loadLatestFromSubdir("cycles", realm); }
export function loadDependencyData(realm: number): unknown { return loadLatestFromSubdir("dependencies", realm); }

import { loadConfig } from "../config/index.js";
import { logger } from "../logging/logger.js";
import { SimcoToolsClient } from "../api/simcoTools.js";
import { DataRepoWriter, getDataRepoWriter } from "../storage/dataRepoWriter.js";
import { getBuilding } from "../data/cooperinc-static.js";

export interface CalculatorLiveData {
  generatedAt: string;
  realm: number;
  economyPhase: "Boom" | "Normal" | "Recession";
  weatherMultiplier: number;
  livePrices: Record<number, Record<number, number>>; // resourceId -> quality -> price
  saturation: Record<number, Record<number, number>>; // resourceId -> quality -> saturation
  source: string;
  dataFreshnessMinutes: number;
}

export interface CooperincDataResult {
  ok: boolean;
  realm: number;
  error?: string;
  data?: CalculatorLiveData;
}

export async function fetchLiveData(realm: number): Promise<CalculatorLiveData | null> {
  const cfg = loadConfig();
  const client = SimcoToolsClient.getOrCreate(realm, cfg.simco.apiBaseUrl, 600, cfg.simcoTools.apiKey);
  
  try {
    // Fetch realm status for economy phase
    const realmStatus = await client.getRealmStatus();
    const economyPhase = realmStatus.summary.phase as "Boom" | "Normal" | "Recession";
    
    // Fetch market prices
    const prices = await client.getMarketPrices();
    
    // Build livePrices: resourceId -> quality -> price
    const livePrices: Record<number, Record<number, number>> = {};
    const saturation: Record<number, Record<number, number>> = {};
    
    for (const p of prices) {
      if (!livePrices[p.resourceId]) {
        livePrices[p.resourceId] = {};
        saturation[p.resourceId] = {};
      }
      livePrices[p.resourceId][p.quality] = p.price;
      // Saturation is not directly available from SimcoTools, use a default
      // In Phase 2, this will be computed from market data
      saturation[p.resourceId][p.quality] = 1.0;
    }
    
    // Get weather multiplier from realm status (if available)
    // SimcoTools doesn't expose weather directly, use default
    const weatherMultiplier = 1.0;
    
    return {
      generatedAt: new Date().toISOString(),
      realm,
      economyPhase,
      weatherMultiplier,
      livePrices,
      saturation,
      source: "simcompanies+simcotools",
      dataFreshnessMinutes: 5,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[realm ${realm}] Failed to fetch live calculator data: ${msg}`);
    return null;
  }
}

export async function runCooperincDataJob(): Promise<CooperincDataResult[]> {
  const cfg = loadConfig();
  const writer = getDataRepoWriter(cfg.dataRepo);
  const results: CooperincDataResult[] = [];
  
  for (const realm of cfg.simco.realms) {
    const startTime = Date.now();
    logger.info(`[CooperincDataJob] Starting live data fetch for realm ${realm}`);
    
    const liveData = await fetchLiveData(realm);
    
    if (!liveData) {
      results.push({ ok: false, realm, error: "Failed to fetch live data" });
      continue;
    }
    
    // Write to Data repo via Contents API
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const subDir = `public/realm-${realm}`;
    
    try {
      await writer.writeSnapshot(
        { timestamp, snapshotType: "calculator-live", data: liveData },
        subDir,
      );
      
      const duration = Date.now() - startTime;
      logger.info(`[CooperincDataJob] Realm ${realm} live data written in ${duration}ms`);
      results.push({ ok: true, realm, data: liveData });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[CooperincDataJob] Realm ${realm} failed to write: ${msg}`);
      results.push({ ok: false, realm, error: msg });
    }
  }
  
  return results;
}
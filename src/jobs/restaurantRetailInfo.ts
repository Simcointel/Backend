import { loadConfig } from "../config/index.js";
import { logger } from "../logging/logger.js";
import { DataRepoWriter, getDataRepoWriter } from "../storage/dataRepoWriter.js";

export interface RestaurantRetailDataPoint {
  averagePrice: number;
  amountSoldRestaurant: number;
  demand: number;
  saturation: number;
  date: string;
}

export interface RestaurantQualityData {
  quality: number;
  dbLetter: number;
  averagePrice: number;
  saturation: number;
  retailData: RestaurantRetailDataPoint[];
}

export interface RestaurantRetailInfoSnapshot {
  timestamp: string;
  snapshotType: "restaurant-retail-info";
  data: RestaurantQualityData[];
}

async function fetchRestaurantRetailInfoFromApi(): Promise<RestaurantQualityData[]> {
  const apiUrl = "https://www.simcompanies.com/api/v4/1/resources-retail-info/";
  
  try {
    const response = await fetch(apiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "SimcoIntel-Backend/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const rawData = await response.json() as any[];
    
    // Normalize the data - API returns array of quality data objects
    const normalizedData: RestaurantQualityData[] = [];
    
    for (const item of rawData) {
      if (item && typeof item.quality === "number") {
        normalizedData.push({
          quality: item.quality,
          dbLetter: item.dbLetter || 150,
          averagePrice: item.averagePrice || 0,
          saturation: item.saturation || 0,
          retailData: item.retailData || [],
        });
      }
    }

    // Sort by quality
    normalizedData.sort((a, b) => a.quality - b.quality);
    
    return normalizedData;
  } catch (error) {
    logger.error("Failed to fetch restaurant retail info from API", error);
    throw error;
  }
}

export async function runFetchRestaurantRetailInfo(): Promise<{ ok: boolean; error?: string; count?: number; data?: RestaurantQualityData[] }> {
  const startTime = Date.now();
  const jobId = `restaurant-retail-${Date.now()}`;
  
  try {
    logger.info(`[${jobId}] Starting restaurant retail info fetch from SimCompanies API...`);
    
    const data = await fetchRestaurantRetailInfoFromApi();
    const fetchDuration = Date.now() - startTime;
    
    logger.info(`[${jobId}] API fetch completed in ${fetchDuration}ms, got ${data.length} quality levels`);
    
    if (!data.length) {
      logger.warn(`[${jobId}] No data returned from API`);
      return { ok: false, error: "No data returned from API" };
    }

    // Log quality levels and sample data for debugging
    logger.info(`[${jobId}] Quality levels: ${data.map(d => `Q${d.quality}`).join(", ")}`);
    if (data.length > 0) {
      const sample = data[0];
      logger.info(`[${jobId}] Sample Q${sample.quality}: avgPrice=${sample.averagePrice}, saturation=${sample.saturation}, retailDataPoints=${sample.retailData.length}`);
      if (sample.retailData.length > 0) {
        const latest = sample.retailData[sample.retailData.length - 1];
        logger.info(`[${jobId}] Latest retail data: date=${latest.date}, amountSoldRestaurant=${latest.amountSoldRestaurant}, avgPrice=${latest.averagePrice}, demand=${latest.demand}, saturation=${latest.saturation}`);
      }
    }

    const cfg = loadConfig();
    const writer = getDataRepoWriter({ 
      path: cfg.dataRepo.path, 
      githubToken: cfg.dataRepo.githubToken, 
      owner: cfg.dataRepo.owner, 
      repo: cfg.dataRepo.repo, 
      branch: cfg.dataRepo.branch 
    });

    const timestamp = new Date().toISOString().replace(/:/g, "-");
    
    const snapshot: RestaurantRetailInfoSnapshot = {
      timestamp: new Date().toISOString(),
      snapshotType: "restaurant-retail-info",
      data,
    };

    logger.info(`[${jobId}] Writing snapshot to Data repo...`);
    const writeStart = Date.now();
    
    await writer.writeSnapshot(
      { timestamp, snapshotType: "restaurant-retail-info", data },
      "aggregates/restaurant-retail-info"
    );

    const writeDuration = Date.now() - writeStart;
    const totalDuration = Date.now() - startTime;
    
    logger.info(`[${jobId}] Snapshot written successfully in ${writeDuration}ms (total: ${totalDuration}ms)`);
    logger.info(`[${jobId}] Restaurant retail info fetched: ${data.length} quality levels`);
    return { ok: true, count: data.length, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;
    logger.error(`[${jobId}] Failed to fetch restaurant retail info after ${duration}ms: ${errorMessage}`, error);
    return { ok: false, error: errorMessage };
  }
}

// Restaurant menu items with base quality
// Based on official restaurant guide
export interface RestaurantMenuItem {
  id: string;
  name: string;
  category: "food" | "beverage" | "dessert";
  baseQuality: number;
  // Standard restaurant: uses linear quality scaling
  // Luxury restaurant: quality affects rating differently
}

export const RESTAURANT_MENU_ITEMS: RestaurantMenuItem[] = [
  // Beverages
  { id: "milk", name: "Milk", category: "beverage", baseQuality: 1 },
  { id: "coffee_powder", name: "Coffee Powder", category: "beverage", baseQuality: 1 },
  { id: "orange_juice", name: "Orange Juice", category: "beverage", baseQuality: 1 },
  { id: "apple_cider", name: "Apple Cider", category: "beverage", baseQuality: 2 },
  { id: "ginger_beer", name: "Ginger Beer", category: "beverage", baseQuality: 2 },
  { id: "cocktail", name: "Cocktail", category: "beverage", baseQuality: 2 },
  
  // Food
  { id: "bread", name: "Bread", category: "food", baseQuality: 1 },
  { id: "butter", name: "Butter", category: "food", baseQuality: 1 },
  { id: "cheese", name: "Cheese", category: "food", baseQuality: 1 },
  { id: "milk", name: "Milk", category: "food", baseQuality: 1 }, // Can be both
  { id: "hamburger", name: "Hamburger", category: "food", baseQuality: 2 },
  { id: "salad", name: "Salad", category: "food", baseQuality: 2 },
  { id: "samosa", name: "Samosa", category: "food", baseQuality: 2 },
  { id: "meat_ball", name: "Meat Balls", category: "food", baseQuality: 2 },
  { id: "pumpkin_soup", name: "Pumpkin Soup", category: "food", baseQuality: 3 },
  { id: "lasagna", name: "Lasagna", category: "food", baseQuality: 3 },
  { id: "apple_pie", name: "Apple Pie", category: "dessert", baseQuality: 2 },
];

export type RestaurantType = "standard" | "luxury";

export interface RestaurantMenuCalculationInput {
  type: RestaurantType;
  quality: number; // 0-12 (food quality)
  salesSpeedBonus: number; // % from recreation + CMO
  cmoCommSkill: number; // CMO communication skill (0-100)
  isLuxury: boolean;
  contractPrice: number; // base menu price
  quantityPerOrder: number;
}

export interface RestaurantMenuCalculationResult {
  rating: number;
  priceMultiplier: number;
  effectivePrice: number;
  competitive: boolean;
  menuItems: Array<{
    item: typeof RESTAURANT_MENU_ITEMS[0];
    effectiveQuality: number;
    priceAtQuality: number;
    amountSoldEstimate: number;
  }>;
}

// Restaurant rating formula (verified from SimCompanies Times #178, #412, official guide)
function calculateRestaurantRating(input: RestaurantMenuCalculationInput): number {
  // Rating = Food Quality Factor + Sales Speed Factor + CMO Comm Factor
  const foodQualityFactor = input.quality * 0.15; // Q12 = 1.8 max
  const salesSpeedRating = input.salesSpeedBonus * 0.02; // +0.02 per % (verified)
  const staffFactor = input.cmoCommSkill * 0.01; // CMO comm skill (0-1.0 at 100)
  
  let rating = foodQualityFactor + salesSpeedRating + staffFactor;
  
  // Luxury restaurant multiplies rating effect (requires rating >= 0.7)
  if (input.isLuxury && rating >= 0.7) {
    rating = rating * 1.5; // Luxury multiplies effect (verified)
  }
  
  return Math.max(0, rating);
}

// Get average amount sold for a quality level from API data
function getAvgAmountSoldForQuality(quality: number, retailData: RestaurantQualityData[]): number {
  const qualityData = retailData.find(d => d.quality === quality);
  if (!qualityData || !qualityData.retailData.length) return 0;
  
  const recentData = qualityData.retailData.slice(-7); // Last 7 days
  if (!recentData.length) return 0;
  
  const sum = recentData.reduce((acc, d) => acc + (d.amountSoldRestaurant || 0), 0);
  return sum / recentData.length;
}

export function calculateRestaurantMenu(
  input: RestaurantMenuCalculationInput,
  retailData: RestaurantQualityData[]
): RestaurantMenuCalculationResult {
  const rating = calculateRestaurantRating(input);
  const priceMultiplier = 1 + rating * 0.1; // 10% price increase per rating point
  const effectivePrice = input.contractPrice * priceMultiplier;
  const competitive = rating >= 5.0; // Meta threshold
  
  // Calculate effective quality for each menu item
  // Standard restaurant: quality scales linearly
  // Luxury restaurant: quality affects rating which affects price
  const menuItems = RESTAURANT_MENU_ITEMS.map(item => {
    // Effective quality for this item
    // Base quality + food quality bonus
    let effectiveQuality = item.baseQuality;
    
    // For luxury, quality affects rating which multiplies price
    // For standard, quality adds to rating linearly
    if (input.isLuxury) {
      effectiveQuality = item.baseQuality + input.quality * 0.2;
    } else {
      effectiveQuality = item.baseQuality + input.quality * 0.1;
    }
    
    // Price at this quality = base price * (1 + effectiveQuality * 0.05)
    // This is a simplified model - actual game uses rating-based pricing
    const priceAtQuality = input.contractPrice * (1 + effectiveQuality * 0.05);
    
    // Estimate amount sold based on API data
    const amountSoldEstimate = getAvgAmountSoldForQuality(input.quality, retailData);
    
    return {
      item,
      effectiveQuality,
      priceAtQuality,
      amountSoldEstimate,
    };
  });
  
  return {
    rating,
    priceMultiplier,
    effectivePrice: input.contractPrice * (1 + calculateRestaurantRating(input) * 0.1),
    competitive,
    menuItems,
  };
}
import { logger } from "../logging/logger.js";
import { getDataRoot } from "./intelligenceUtils.js";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { SimcoToolsClient } from "../api/simcoTools.js";

export interface ResourceData {
  id: number;
  name: string;
  isResearch: boolean;
  transportation: number;
  producedAnHour: number;
  speedModifier: number;
  wages: number;
  inputs: Record<string, { name: string; quantity: number }>;
  retailInfo: Array<Record<string, unknown>> | null;
  producedAt: number; // Building ID
}

export interface ResourcesSnapshot {
  realm: number;
  generatedAt: string;
  resources: ResourceData[];
}

const RESOURCES_DIR = (realm: number) => `public/realm-${realm}/resources`;

/**
 * Fetch all resources from the Sim Companies API for a realm
 */
export async function fetchResourcesForRealm(realm: number): Promise<ResourcesSnapshot> {
  const client = SimcoToolsClient.getOrCreate(realm);
  const response = await client.getResources(true);
  return {
    realm,
    generatedAt: new Date().toISOString(),
    resources: response.resources,
  };
}

/**
 * Save resources snapshot to the data repo
 */
export function saveResourcesSnapshot(snapshot: ResourcesSnapshot): string {
  const dir = resolve(getDataRoot(), RESOURCES_DIR(snapshot.realm));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const filename = `resources-${new Date().toISOString().split("T")[0]}.json`;
  const filepath = resolve(dir, filename);
  writeFileSync(filepath, JSON.stringify(snapshot, null, 2));
  
  // Update index.json
  const indexPath = resolve(dir, "index.json");
  const index = { latest: filename };
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  
  logger.info(`Saved resources snapshot for realm ${snapshot.realm} to ${filename}`);
  return filename;
}

/**
 * Load latest resources for a realm
 */
export function loadLatestResources(realm: number): ResourcesSnapshot | null {
  const dir = resolve(getDataRoot(), RESOURCES_DIR(realm));
  const indexPath = resolve(dir, "index.json");
  if (!existsSync(indexPath)) return null;
  
  try {
    const index = JSON.parse(readFileSync(indexPath, "utf-8"));
    if (!index.latest) return null;
    const filepath = resolve(dir, index.latest);
    if (!existsSync(filepath)) return null;
    return JSON.parse(readFileSync(filepath, "utf-8")) as ResourcesSnapshot;
  } catch {
    return null;
  }
}

/**
 * Fetch and save resources for all configured realms
 */
export async function runAllResourcesFetch(): Promise<{ ok: boolean; results: Record<number, { ok: boolean; error?: string }> }> {
  const { loadConfig } = await import("../config/index.js");
  const cfg = loadConfig();
  const results: Record<number, { ok: boolean; error?: string }> = {};
  
  for (const realm of cfg.simco.realms) {
    try {
      logger.info(`Fetching resources for realm ${realm}`);
      const snapshot = await fetchResourcesForRealm(realm);
      saveResourcesSnapshot(snapshot);
      results[realm] = { ok: true };
      logger.info(`Successfully fetched ${snapshot.resources.length} resources for realm ${realm}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to fetch resources for realm ${realm}: ${msg}`);
      results[realm] = { ok: false, error: msg };
    }
  }
  
  const allOk = Object.values(results).every(r => r.ok);
  return { ok: allOk, results };
}
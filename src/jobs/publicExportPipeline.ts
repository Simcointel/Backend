import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { DataRepoWriter } from "../storage/dataRepoWriter.js";
import { getDataRoot } from "./intelligenceUtils.js";
import {
  loadLatestMacroData,
  loadMacroHistory,
  loadMacroIndexes,
  loadMacroInflation,
} from "../api/routes/publicData.js";
import { runMacroPipeline } from "./macroPipeline.js";
import { computeProfitMargins } from "./profitMargins.js";
import { runRetailSummary } from "./retailSummary.js";
import { validatePublicDataset } from "./validation.js";

export interface PublicExportResult {
  ok: boolean;
  files: { path: string; bytes: number }[];
  errors: string[];
  durationMs: number;
}

function writeJson(dir: string, name: string, data: unknown): { path: string; bytes: number } | null {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const full = resolve(dir, name);
    const content = JSON.stringify(data, null, 2) + "\n";
    writeFileSync(full, content, "utf-8");
    return { path: full, bytes: content.length };
  } catch (err) {
    logger.warn(`Failed to write ${name}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}


export async function runPublicExportPipeline(): Promise<PublicExportResult> {
  const start = Date.now();
  const result: PublicExportResult = { ok: true, files: [], errors: [], durationMs: 0 };
  const cfg = loadConfig();
  const publicDir = resolve(getDataRoot(), "public");
  const realms = cfg.simco.realms;

  // Run the macro pipeline first to ensure data is fresh
  try {
    await runMacroPipeline();
  } catch (err) {
    logger.warn(`Macro pipeline failed before export: ${err}`);
  }

  try {
    if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

    // Per-realm datasets
    for (const realm of realms) {
      const rd = resolve(publicDir, `realm-${realm}`);
      if (!existsSync(rd)) mkdirSync(rd, { recursive: true });

      // 1. Macro Data
      const macro = loadLatestMacroData(realm);
      if (validatePublicDataset("macro", macro).valid) {
        const mf = writeJson(rd, "macro.json", macro);
        if (mf) result.files.push(mf);
      }

      // 2. History (Last 120 entries)
      const history = loadMacroHistory(realm, 120);
      if (validatePublicDataset("history", history.entries).valid) {
        const hf = writeJson(rd, "history.json", history.entries);
        if (hf) result.files.push(hf);
      }

      // 3. Price Indexes
      const indexes = loadMacroIndexes(realm, 60);
      if (validatePublicDataset("indexes", indexes.indexes).valid) {
        const inf = writeJson(rd, "indexes.json", indexes.indexes);
        if (inf) result.files.push(inf);
      }

      // 4. Inflation
      const inflation = loadMacroInflation(realm, 60);
      if (validatePublicDataset("inflation", inflation.inflation).valid) {
        const inflf = writeJson(rd, "inflation.json", inflation.inflation);
        if (inflf) result.files.push(inflf);
      }

      // 5. Profit Margins (Critical for frontend)
      try {
        const margins = await computeProfitMargins(realm);
        if (margins.ok && validatePublicDataset("margins", margins.rs).valid) {
           const mgf = writeJson(rd, "margins.json", margins.rs);
           if (mgf) result.files.push(mgf);
        }
      } catch (err) {
        logger.warn(`[realm ${realm}] Failed to export margins: ${err}`);
      }

      // 6. Retail Data (for retail calculator)
      try {
        await runRetailSummary(realm);
        const retailData = JSON.parse(readFileSync(resolve(getDataRoot(), "aggregates", "retail", `realm-${realm}`, "index.json"), "utf-8")) as { latest: string };
        if (retailData.latest) {
          const retail = JSON.parse(readFileSync(resolve(getDataRoot(), "aggregates", "retail", `realm-${realm}`, retailData.latest), "utf-8"));
          const rf = writeJson(rd, "retail.json", retail);
          if (rf) result.files.push(rf);
        }
      } catch (err) {
        logger.warn(`[realm ${realm}] Failed to export retail data: ${err}`);
      }
    }

    // Manifest
    const manifest = {
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      realms,
      files: result.files.map((f) => ({
        path: f.path.split("/public/")[1],
        bytes: f.bytes,
      })),
    };
    const manf = writeJson(publicDir, "manifest.json", manifest);
    if (manf) result.files.push(manf);

  } catch (err) {
    result.ok = false;
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  result.durationMs = Date.now() - start;

  // Push to Git if enabled
  if (cfg.featureFlags.enableCommitPush) {
    try {
      const writer = new DataRepoWriter(cfg.dataRepo);
      await writer.commitAndPush(`public export refresh`);
    } catch (err) {
      result.errors.push(`git-push: ${err}`);
    }
  }

  logger.info(`Public export pipeline: ${result.files.length} files in ${result.durationMs}ms`);
  return result;
}

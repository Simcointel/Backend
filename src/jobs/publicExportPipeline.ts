import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { getDataRoot } from "./intelligenceUtils.js";
import {
  loadLastDashboardSummaries,
  loadLatestMacroData,
  loadMacroHistory,
  loadMacroIndexes,
  loadMacroInflation,
  loadCorrelations,
  loadAnomalies,
  loadDivergence,
  loadContagion,
  loadSectorIntelligence,
} from "../api/routes/publicData.js";
import { computeForecasts } from "./forecastEngine.js";
import { generateSignals } from "./signalEngine.js";
import { detectCycle } from "./cycleEngine.js";
import { computeDependencies } from "./dependencyEngine.js";

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

export function runPublicExportPipeline(): PublicExportResult {
  const start = Date.now();
  const result: PublicExportResult = { ok: true, files: [], errors: [], durationMs: 0 };
  const cfg = loadConfig();
  const publicDir = resolve(getDataRoot(), "public");
  const realms = cfg.simco.realms;

  try {
    if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

    // Dashboard
    const dash = loadLastDashboardSummaries();
    const df = writeJson(publicDir, "dashboard.json", dash);
    if (df) result.files.push(df);

    // Per-realm datasets
    for (const realm of realms) {
      const rd = resolve(publicDir, `realm-${realm}`);
      if (!existsSync(rd)) mkdirSync(rd, { recursive: true });

      const macro = loadLatestMacroData(realm);
      const mf = writeJson(rd, "macro.json", macro);
      if (mf) result.files.push(mf);

      const history = loadMacroHistory(realm, 120);
      const hf = writeJson(rd, "history.json", history.entries);
      if (hf) result.files.push(hf);

      const indexes = loadMacroIndexes(realm, 60);
      const inf = writeJson(rd, "indexes.json", indexes.indexes);
      if (inf) result.files.push(inf);

      const inflation = loadMacroInflation(realm, 60);
      const inflf = writeJson(rd, "inflation.json", inflation.inflation);
      if (inflf) result.files.push(inflf);
    }

    // Cross-realm intelligence
    const sectors = loadSectorIntelligence();
    const sf = writeJson(publicDir, "sectors.json", sectors);
    if (sf) result.files.push(sf);

    const correlations = loadCorrelations();
    const cf = writeJson(publicDir, "correlations.json", correlations);
    if (cf) result.files.push(cf);

    const anomalies = loadAnomalies();
    const af = writeJson(publicDir, "anomalies.json", anomalies);
    if (af) result.files.push(af);

    const divergence = loadDivergence();
    const df2 = writeJson(publicDir, "divergence.json", divergence);
    if (df2) result.files.push(df2);

    const contagion = loadContagion();
    const cof = writeJson(publicDir, "contagion.json", contagion);
    if (cof) result.files.push(cof);

    // Per-realm forecast datasets
    for (const realm of realms) {
      const rd = resolve(publicDir, `realm-${realm}`);
      try {
        const fc = computeForecasts(realm);
        if (fc.ok) { const ff = writeJson(rd, "forecast.json", fc.series); if (ff) result.files.push(ff); }
        const sg = generateSignals(realm);
        if (sg.ok) { const sf2 = writeJson(rd, "signals.json", sg.signals); if (sf2) result.files.push(sf2); }
        const cy = detectCycle(realm);
        if (cy.ok) { const cf2 = writeJson(rd, "cycles.json", cy); if (cf2) result.files.push(cf2); }
        const dp = computeDependencies(realm);
        if (dp.ok) { const df3 = writeJson(rd, "dependencies.json", dp); if (df3) result.files.push(df3); }
      } catch { /* forecast export non-critical */ }
    }

    // Manifest
    const manifest = {
      generatedAt: new Date().toISOString(),
      realms,
      fileCount: result.files.length,
      files: result.files.map((f) => ({
        path: f.path.replace(publicDir, "public"),
        bytes: f.bytes,
      })),
      schema: "https://raw.githubusercontent.com/SimcoIntel/main/main/Data/public/schema.json",
    };
    writeJson(publicDir, "manifest.json", manifest);
    result.files.push({ path: resolve(publicDir, "manifest.json"), bytes: JSON.stringify(manifest).length });

  } catch (err) {
    result.ok = false;
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  result.durationMs = Date.now() - start;
  logger.info(`Public export pipeline: ${result.files.length} files in ${result.durationMs}ms`);
  return result;
}

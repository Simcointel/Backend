import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { resolve } from "path";
import { loadConfig } from "../config/index.js";
import { getDataRoot } from "../jobs/intelligenceUtils.js";
import { logger } from "../logging/logger.js";
import type { PhaseCoefficients } from "../calculators/types.js";

interface MarketDataPoint {
  price: number;
  quantity: number;
  phase: "Boom" | "Normal" | "Recession";
  productId: number;
  quality: number;
  timestamp: string;
}

interface RegressionResult {
  T: number;
  U: number;
  V: number;
  W: number;
  rSquared: number;
  sampleSize: number;
}

export function cubicRegression(points: { x: number; y: number }[]): RegressionResult {
  const n = points.length;
  if (n < 4) {
    return { T: 0, U: 0, V: 0, W: 0, rSquared: 0, sampleSize: n };
  }

  const sums = {
    x: 0, x2: 0, x3: 0, x4: 0, x5: 0, x6: 0,
    y: 0, xy: 0, x2y: 0, x3y: 0,
  };

  for (const p of points) {
    const x = p.x;
    const y = p.y;
    const x2 = x * x;
    const x3 = x2 * x;
    const x4 = x3 * x;
    const x5 = x4 * x;
    const x6 = x5 * x;

    sums.x += x;
    sums.x2 += x2;
    sums.x3 += x3;
    sums.x4 += x4;
    sums.x5 += x5;
    sums.x6 += x6;
    sums.y += y;
    sums.xy += x * y;
    sums.x2y += x2 * y;
    sums.x3y += x3 * y;
  }

  const A = [
    [sums.x6, sums.x5, sums.x4, sums.x3],
    [sums.x5, sums.x4, sums.x3, sums.x2],
    [sums.x4, sums.x3, sums.x2, sums.x],
    [sums.x3, sums.x2, sums.x, n],
  ];
  const b = [sums.x3y, sums.x2y, sums.xy, sums.y];

  const coeffs = solveLinearSystem(A, b);
  if (!coeffs) {
    return { T: 0, U: 0, V: 0, W: 0, rSquared: 0, sampleSize: n };
  }

  const [V, T, U, W] = coeffs;

  let ssRes = 0;
  let ssTot = 0;
  const yMean = sums.y / n;

  for (const p of points) {
    const predicted = T * p.x ** 2 + U * p.x + V * p.x ** 3 + W;
    ssRes += (p.y - predicted) ** 2;
    ssTot += (p.y - yMean) ** 2;
  }

  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { T, U, V, W, rSquared, sampleSize: n };
}

export function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivotRow][col])) {
        pivotRow = row;
      }
    }

    if (Math.abs(M[pivotRow][col]) < 1e-10) return null;

    if (pivotRow !== col) {
      [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
    }

    const pivot = M[col][col];
    for (let j = col; j <= n; j++) {
      M[col][j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = M[row][col];
        for (let j = col; j <= n; j++) {
          M[row][j] -= factor * M[col][j];
        }
      }
    }
  }

  return M.map(row => row[n]);
}

export function removeOutliersIQR(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 4) return points;

  const sorted = [...points].sort((a, b) => a.y - b.y);
  const q1Idx = Math.floor(sorted.length * 0.25);
  const q3Idx = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Idx].y;
  const q3 = sorted[q3Idx].y;
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;

  return points.filter(p => p.y >= lower && p.y <= upper);
}

export interface PhaseCoefficientResult {
  ok: boolean;
  realm: number;
  coefficients: PhaseCoefficients[];
  errors: string[];
  durationMs: number;
}

export async function derivePhaseCoefficients(realm: number): Promise<PhaseCoefficientResult> {
  const start = Date.now();
  const cfg = loadConfig();
  const dataRoot = getDataRoot();
  const errors: string[] = [];
  const coefficients: PhaseCoefficients[] = [];

  try {
    const marketAggPath = resolve(dataRoot, "aggregates", "market", `realm-${realm}`);
    if (!existsSync(marketAggPath)) {
      errors.push(`Market aggregates directory not found: ${marketAggPath}`);
      return { ok: false, realm, coefficients: [], errors, durationMs: Date.now() - start };
    }

    const macroHistoryPath = resolve(dataRoot, "aggregates", "macro-history", `realm-${realm}`);
    if (!existsSync(macroHistoryPath)) {
      errors.push(`Macro history directory not found: ${macroHistoryPath}`);
      return { ok: false, realm, coefficients: [], errors, durationMs: Date.now() - start };
    }

    const phaseByDate = new Map<string, "Boom" | "Normal" | "Recession">();
    const historyFiles = readdirSync(macroHistoryPath).filter(f => f.endsWith(".json"));
    
    for (const file of historyFiles) {
      try {
        const content = readFileSync(resolve(macroHistoryPath, file), "utf-8");
        const data = JSON.parse(content);
        if (data.entries) {
          for (const entry of data.entries) {
            if (entry.d && entry.ph) {
              phaseByDate.set(entry.d, entry.ph as "Boom" | "Normal" | "Recession");
            }
          }
        }
      } catch (e) {
        logger.warn(`Failed to parse macro history file ${file}: ${e}`);
      }
    }

    const dataPoints = new Map<string, MarketDataPoint[]>();

    const marketFiles = readdirSync(marketAggPath).filter(f => f.startsWith("market-") && f.endsWith(".json"));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    for (const file of marketFiles) {
      try {
        const content = readFileSync(resolve(marketAggPath, file), "utf-8");
        const snapshot = JSON.parse(content);
        
        const fileDate = file.replace("market-", "").replace(".json", "").replace(/-/g, ":").slice(0, 10);
        if (fileDate < cutoffStr) continue;

        const phase = phaseByDate.get(fileDate) || "Normal";

        if (snapshot.data?.rc) {
          for (const resource of snapshot.data.rc) {
            const productId = resource.i;
            for (let quality = 0; quality <= 12; quality++) {
              const priceKey = `q${quality}`;
              const qtyKey = `qty${quality}`;
              const price = resource[priceKey];
              const qty = resource[qtyKey];

              if (typeof price === "number" && typeof qty === "number" && qty > 0) {
                const key = `${productId}-${quality}-${phase}`;
                if (!dataPoints.has(key)) dataPoints.set(key, []);
                dataPoints.get(key)!.push({ price, quantity: qty, phase, productId, quality, timestamp: fileDate });
              }
            }
          }
        }
      } catch (e) {
        logger.warn(`Failed to parse market file ${file}: ${e}`);
      }
    }

    for (const [key, points] of dataPoints) {
      if (points.length < 100) continue;

      const [productIdStr, qualityStr, phase] = key.split("-");
      const productId = parseInt(productIdStr, 10);
      const quality = parseInt(qualityStr, 10);

      const regressionPoints = points.map(p => ({ x: p.price, y: p.quantity }));
      const cleanPoints = removeOutliersIQR(regressionPoints);
      
      if (cleanPoints.length < 50) continue;

      const result = cubicRegression(cleanPoints);

      if (result.rSquared >= 0.85 || (productId <= 50 && result.rSquared >= 0.7)) {
        coefficients.push({
          productId,
          quality,
          phase: phase as "Boom" | "Normal" | "Recession",
          T: Math.round(result.T * 1e8) / 1e8,
          U: Math.round(result.U * 1e8) / 1e8,
          V: Math.round(result.V * 1e8) / 1e8,
          W: Math.round(result.W * 1e8) / 1e8,
          rSquared: Math.round(result.rSquared * 10000) / 10000,
          sampleSize: result.sampleSize,
          derivedAt: new Date().toISOString(),
        });
      }
    }

    logger.info(`[PhaseCoefficients] Realm ${realm}: derived ${coefficients.length} coefficient sets from ${dataPoints.size} product/quality/phase groups`);

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    logger.error(`[PhaseCoefficients] Realm ${realm} failed: ${msg}`);
  }

  return { ok: errors.length === 0, realm, coefficients, errors, durationMs: Date.now() - start };
}

export async function storePhaseCoefficients(realm: number, coefficients: PhaseCoefficients[]): Promise<string | null> {
  const cfg = loadConfig();
  const dataRoot = getDataRoot();
  const outputDir = resolve(dataRoot, "aggregates", "phase-coefficients", `realm-${realm}`);
  
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `phase-coefficients-${dateStr}.json`;
  const filepath = resolve(outputDir, filename);

  const output = {
    derivedAt: new Date().toISOString(),
    realm,
    dataWindowDays: 30,
    coefficients,
  };

  try {
    writeFileSync(filepath, JSON.stringify(output, null, 2) + "\n", "utf-8");

    const indexPath = resolve(outputDir, "index.json");
    const index = { latest: filename, files: [filename] };
    writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n", "utf-8");

    logger.info(`[PhaseCoefficients] Stored coefficients for realm ${realm} to ${filename}`);
    return filepath;
  } catch (e) {
    logger.error(`[PhaseCoefficients] Failed to store coefficients for realm ${realm}: ${e}`);
    return null;
  }
}

export async function runPhaseCoefficientJob(): Promise<PhaseCoefficientResult[]> {
  const cfg = loadConfig();
  const results: PhaseCoefficientResult[] = [];

  for (const realm of cfg.simco.realms) {
    const result = await derivePhaseCoefficients(realm);
    if (result.ok && result.coefficients.length > 0) {
      await storePhaseCoefficients(realm, result.coefficients);
    }
    results.push(result);
  }

  return results;
}
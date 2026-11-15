import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

// Helper to create a clean test data directory per test
function createTestDataRoot(testName: string) {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testDir = resolve(__dirname, "..", "..", "test-data-temp", `${testName.replace(/[^a-zA-Z0-9]/g, "-")}-${uniqueSuffix}`);
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function cleanupTestDataRoot(testDir: string) {
  if (existsSync(testDir)) {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on Windows
    }
  }
}

// Simulates what backend produces for public export
function writeJson(dir: string, name: string, data: unknown): { path: string; bytes: number } | null {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const full = resolve(dir, name);
    const content = JSON.stringify(data, null, 2) + "\n";
    writeFileSync(full, content, "utf-8");
    return { path: full, bytes: content.length };
  } catch (err) {
    return null;
  }
}

function runExportPipeline(dataRoot: string, realms: number[]): { files: { path: string; bytes: number }[]; manifest: any } {
  const publicDir = resolve(dataRoot, "public");
  const result = { files: [] as { path: string; bytes: number }[] };

  for (const realm of realms) {
    const rd = resolve(publicDir, `realm-${realm}`);
    if (!existsSync(rd)) mkdirSync(rd, { recursive: true });

    // 1. Macro Data
    const macroData = {
      realm: String(realm),
      latest: {
        companiesValue: 1000000000,
        activeCompanies: 50000,
        bondsSold: 1000,
        totalBuildings: 200000,
      },
      latestIndexes: { cpi: 105.5, coreCpi: 103.2, gdp: 110.1 },
      latestInflation: { cpiRate: 2.5, coreCpiRate: 2.1, gdpGrowth: 3.2 },
      generatedAt: "2024-01-15T12:00:00.000Z",
    };
    const mf = writeJson(rd, "macro.json", macroData);
    if (mf) result.files.push(mf);

    // 2. History
    const historyData = [
      { d: "2024-01-10", ac: 49000, cv: 980000000, tb: 195000, bs: 950, ph: "growth", cp: true },
      { d: "2024-01-11", ac: 49500, cv: 990000000, tb: 197000, bs: 970, ph: "growth", cp: true },
      { d: "2024-01-12", ac: 50000, cv: 1000000000, tb: 199000, bs: 990, ph: "growth", cp: true },
      { d: "2024-01-13", ac: 50200, cv: 1005000000, tb: 200000, bs: 1000, ph: "expansion", cp: true },
      { d: "2024-01-14", ac: 50100, cv: 1002000000, tb: 200500, bs: 1005, ph: "expansion", cp: true },
      { d: "2024-01-15", ac: 50000, cv: 1000000000, tb: 200000, bs: 1000, ph: "expansion", cp: true },
    ];
    const hf = writeJson(rd, "history.json", historyData);
    if (hf) result.files.push(hf);

    // 3. Price Indexes
    const indexesData = [
      { t: "2024-01-10", ix: { cpi: { v: 104.0 }, "core-cpi": { v: 102.0 }, gdp: { v: 108.0 } } },
      { t: "2024-01-11", ix: { cpi: { v: 104.5 }, "core-cpi": { v: 102.5 }, gdp: { v: 108.5 } } },
      { t: "2024-01-12", ix: { cpi: { v: 105.0 }, "core-cpi": { v: 103.0 }, gdp: { v: 109.0 } } },
      { t: "2024-01-13", ix: { cpi: { v: 105.5 }, "core-cpi": { v: 103.2 }, gdp: { v: 110.1 } } },
      { t: "2024-01-14", ix: { cpi: { v: 105.3 }, "core-cpi": { v: 103.1 }, gdp: { v: 110.0 } } },
      { t: "2024-01-15", ix: { cpi: { v: 105.5 }, "core-cpi": { v: 103.2 }, gdp: { v: 110.1 } } },
    ];
    const inf = writeJson(rd, "indexes.json", indexesData);
    if (inf) result.files.push(inf);

    // 4. Inflation
    const inflationData = [
      { t: "2024-01-10", in: { cpi: { ch: 2.0 }, "core-cpi": { ch: 1.8 }, gdp: { ch: 2.5 } } },
      { t: "2024-01-11", in: { cpi: { ch: 2.2 }, "core-cpi": { ch: 1.9 }, gdp: { ch: 2.7 } } },
      { t: "2024-01-12", in: { cpi: { ch: 2.4 }, "core-cpi": { ch: 2.0 }, gdp: { ch: 3.0 } } },
      { t: "2024-01-13", in: { cpi: { ch: 2.5 }, "core-cpi": { ch: 2.1 }, gdp: { ch: 3.2 } } },
      { t: "2024-01-14", in: { cpi: { ch: 2.4 }, "core-cpi": { ch: 2.0 }, gdp: { ch: 3.1 } } },
      { t: "2024-01-15", in: { cpi: { ch: 2.5 }, "core-cpi": { ch: 2.1 }, gdp: { ch: 3.2 } } },
    ];
    const inflf = writeJson(rd, "inflation.json", inflationData);
    if (inflf) result.files.push(inflf);

    // 5. Profit Margins
    const marginsData = [
      { i: 1, n: "Iron", c: "extraction", cn: "Extraction", ph: 10, rv: 8500, ic: 0, wg: 1000, tr: 50, np: 7450, mg: 87.6, vw: 1000, ir: false },
      { i: 2, n: "Steel", c: "manufacturing", cn: "Manufacturing", ph: 5, rv: 15000, ic: 2000, wg: 1000, tr: 50, np: 11950, mg: 79.7, vw: 3000, ir: false },
      { i: 3, n: "Tools", c: "manufacturing", cn: "Manufacturing", ph: 2, rv: 16000, ic: 4500, wg: 1000, tr: 100, np: 10400, mg: 65.0, vw: 8000, ir: false },
      { i: 4, n: "Electronics", c: "manufacturing", cn: "Manufacturing", ph: 1, rv: 20000, ic: 12000, wg: 500, tr: 50, np: 7450, mg: 37.3, vw: 20000, ir: false },
      { i: 5, n: "Oil", c: "extraction", cn: "Extraction", ph: 20, rv: 10000, ic: 0, wg: 1000, tr: 40, np: 8960, mg: 89.6, vw: 500, ir: true },
      { i: 6, n: "Coal", c: "extraction", cn: "Extraction", ph: 15, rv: 4500, ic: 0, wg: 1500, tr: 30, np: 2970, mg: 66.0, vw: 300, ir: false },
      { i: 7, n: "Copper", c: "extraction", cn: "Extraction", ph: 8, rv: 9600, ic: 0, wg: 1200, tr: 40, np: 8360, mg: 87.1, vw: 1200, ir: false },
      { i: 8, n: "Aluminum", c: "extraction", cn: "Extraction", ph: 6, rv: 10800, ic: 0, wg: 1800, tr: 60, np: 8940, mg: 82.8, vw: 1800, ir: false },
      { i: 9, n: "Gold", c: "extraction", cn: "Extraction", ph: 1, rv: 50000, ic: 0, wg: 5000, tr: 200, np: 44800, mg: 89.6, vw: 50000, ir: false },
      { i: 10, n: "Diamond", c: "extraction", cn: "Extraction", ph: 0.5, rv: 100000, ic: 0, wg: 10000, tr: 500, np: 89500, mg: 89.5, vw: 200000, ir: false },
    ];
    const mgf = writeJson(rd, "margins.json", marginsData);
    if (mgf) result.files.push(mgf);

    // 6. Retail Data
    const retailData = {
      lastUpdated: "2024-01-15T12:00:00.000Z",
      retailIndexes: {
        "Consumer Goods": { index: 102.5, trend: "up" },
        "Luxury Goods": { index: 105.0, trend: "up" },
        "Industrial Supplies": { index: 98.0, trend: "down" },
      },
    };
    const rf = writeJson(rd, "retail.json", retailData);
    if (rf) result.files.push(rf);

    // 7. Calculator Live Data (NEW)
    const calculatorLiveData = {
      generatedAt: "2024-01-15T12:00:00.000Z",
      realm,
      economyPhase: "Boom",
      weatherMultiplier: 1.012070213133127,
      livePrices: {
        "3": { "0": 5.462, "1": 5.789, "2": 6.0 },
      },
      saturation: {
        "3": { "0": 1.4768, "1": 1.234, "2": 1.1 },
      },
      source: "simcompanies+simcotools",
      dataFreshnessMinutes: 5,
    };
    const clf = writeJson(rd, "calculator-live.json", calculatorLiveData);
    if (clf) result.files.push(clf);
  }

  // Manifest
  const manifest = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    realms,
    files: result.files.map((f) => {
      const pathStr = f.path.replace(/\\/g, "/");
      const parts = pathStr.split("/public/");
      return {
        path: parts[1] || pathStr,
        bytes: f.bytes,
      };
    }),
  };
  const manf = writeJson(publicDir, "manifest.json", manifest);
  if (manf) result.files.push(manf);

  return { files: result.files, manifest };
}

async function fetchPublicData(dataRoot: string, realm: number, file: string): Promise<any> {
  const path = resolve(dataRoot, "public", `realm-${realm}`, file);
  if (!existsSync(path)) throw new Error(`File not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

async function fetchManifest(dataRoot: string): Promise<any> {
  const path = resolve(dataRoot, "public", "manifest.json");
  if (!existsSync(path)) throw new Error("Manifest not found");
  return JSON.parse(readFileSync(path, "utf-8"));
}

describe("Contract: Data Repo JSON Schemas", () => {
  it("exports all required files for both realms including calculator-live", () => {
    const dataRoot = createTestDataRoot("exports all required files for both realms");
    const realms = [0, 1];

    const { files, manifest } = runExportPipeline(dataRoot, realms);

    // Should have 7 data files per realm + 1 manifest = 15 files written
    expect(files.length).toBe(15);
    expect(manifest.realms).toEqual([0, 1]);
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.files.length).toBe(14); // 7 data files * 2 realms

    // Verify each realm has all 7 files
    for (const realm of realms) {
      const realmFiles = manifest.files.filter((f: any) => f.path.startsWith(`realm-${realm}/`));
      expect(realmFiles.length).toBe(7);

      const expectedFiles = ["macro.json", "history.json", "indexes.json", "inflation.json", "margins.json", "retail.json", "calculator-live.json"];
      for (const ef of expectedFiles) {
        expect(realmFiles.some((f: any) => f.path === `realm-${realm}/${ef}`)).toBe(true);
      }
    }

    cleanupTestDataRoot(dataRoot);
  });

  it("macro.json matches required schema", async () => {
    const dataRoot = createTestDataRoot("macro.json matches required schema");
    runExportPipeline(dataRoot, [0]);

    const data = await fetchPublicData(dataRoot, 0, "macro.json");

    // Required fields per frontend contract
    expect(data).toHaveProperty("realm", "0");
    expect(data).toHaveProperty("latest");
    expect(data.latest).toHaveProperty("companiesValue");
    expect(data.latest).toHaveProperty("activeCompanies");
    expect(data.latest).toHaveProperty("bondsSold");
    expect(data.latest).toHaveProperty("totalBuildings");
    expect(data).toHaveProperty("latestIndexes");
    expect(data.latestIndexes).toHaveProperty("cpi");
    expect(data.latestIndexes).toHaveProperty("coreCpi");
    expect(data.latestIndexes).toHaveProperty("gdp");
    expect(data).toHaveProperty("latestInflation");
    expect(data.latestInflation).toHaveProperty("cpiRate");
    expect(data.latestInflation).toHaveProperty("coreCpiRate");
    expect(data.latestInflation).toHaveProperty("gdpGrowth");
    expect(data).toHaveProperty("generatedAt");

    // Types
    expect(typeof data.realm).toBe("string");
    expect(typeof data.latest.companiesValue).toBe("number");
    expect(typeof data.latest.activeCompanies).toBe("number");
    expect(typeof data.latest.bondsSold).toBe("number");
    expect(typeof data.latest.totalBuildings).toBe("number");
    expect(typeof data.generatedAt).toBe("string");

    cleanupTestDataRoot(dataRoot);
  });

  it("history.json matches required schema", async () => {
    const dataRoot = createTestDataRoot("history.json matches required schema");
    runExportPipeline(dataRoot, [0]);

    const data = await fetchPublicData(dataRoot, 0, "history.json");

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    const entry = data[0];
    expect(entry).toHaveProperty("d");
    expect(entry).toHaveProperty("ac");
    expect(entry).toHaveProperty("cv");
    expect(entry).toHaveProperty("tb");
    expect(entry).toHaveProperty("bs");
    expect(entry).toHaveProperty("ph");
    expect(entry).toHaveProperty("cp");

    cleanupTestDataRoot(dataRoot);
  });

  it("indexes.json matches required schema", async () => {
    const dataRoot = createTestDataRoot("indexes.json matches required schema");
    runExportPipeline(dataRoot, [0]);

    const data = await fetchPublicData(dataRoot, 0, "indexes.json");

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    const entry = data[0];
    expect(entry).toHaveProperty("t");
    expect(entry).toHaveProperty("ix");
    expect(entry.ix).toHaveProperty("cpi");
    expect(entry.ix.cpi).toHaveProperty("v");
    expect(entry.ix).toHaveProperty("core-cpi");
    expect(entry.ix["core-cpi"]).toHaveProperty("v");
    expect(entry.ix).toHaveProperty("gdp");
    expect(entry.ix.gdp).toHaveProperty("v");

    cleanupTestDataRoot(dataRoot);
  });

  it("inflation.json matches required schema", async () => {
    const dataRoot = createTestDataRoot("inflation.json matches required schema");
    runExportPipeline(dataRoot, [0]);

    const data = await fetchPublicData(dataRoot, 0, "inflation.json");

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    const entry = data[0];
    expect(entry).toHaveProperty("t");
    expect(entry).toHaveProperty("in");
    expect(entry.in).toHaveProperty("cpi");
    expect(entry.in.cpi).toHaveProperty("ch");
    expect(entry.in).toHaveProperty("core-cpi");
    expect(entry.in["core-cpi"]).toHaveProperty("ch");
    expect(entry.in).toHaveProperty("gdp");
    expect(entry.in.gdp).toHaveProperty("ch");

    cleanupTestDataRoot(dataRoot);
  });

  it("margins.json matches required schema", async () => {
    const dataRoot = createTestDataRoot("margins.json matches required schema");
    runExportPipeline(dataRoot, [0]);

    const data = await fetchPublicData(dataRoot, 0, "margins.json");

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(10);

    const entry = data[0];
    expect(entry).toHaveProperty("i");
    expect(entry).toHaveProperty("n");
    expect(entry).toHaveProperty("c");
    expect(entry).toHaveProperty("cn");
    expect(entry).toHaveProperty("ph");
    expect(entry).toHaveProperty("rv");
    expect(entry).toHaveProperty("ic");
    expect(entry).toHaveProperty("wg");
    expect(entry).toHaveProperty("tr");
    expect(entry).toHaveProperty("np");
    expect(entry).toHaveProperty("mg");
    expect(entry).toHaveProperty("vw");
    expect(entry).toHaveProperty("ir");

    // Verify all entries have required fields
    for (const e of data) {
      expect(e).toHaveProperty("i");
      expect(e).toHaveProperty("n");
      expect(e).toHaveProperty("c");
      expect(e).toHaveProperty("cn");
      expect(e).toHaveProperty("ph");
      expect(e).toHaveProperty("rv");
      expect(e).toHaveProperty("ic");
      expect(e).toHaveProperty("wg");
      expect(e).toHaveProperty("tr");
      expect(e).toHaveProperty("np");
      expect(e).toHaveProperty("mg");
      expect(e).toHaveProperty("vw");
      expect(e).toHaveProperty("ir");
    }

    cleanupTestDataRoot(dataRoot);
  });

  it("retail.json matches required schema", async () => {
    const dataRoot = createTestDataRoot("retail.json matches required schema");
    runExportPipeline(dataRoot, [0]);

    const data = await fetchPublicData(dataRoot, 0, "retail.json");

    expect(data).toHaveProperty("lastUpdated");
    expect(data).toHaveProperty("retailIndexes");
    expect(data.retailIndexes).toHaveProperty("Consumer Goods");
    expect(data.retailIndexes["Consumer Goods"]).toHaveProperty("index");
    expect(data.retailIndexes["Consumer Goods"]).toHaveProperty("trend");
    expect(data.retailIndexes).toHaveProperty("Luxury Goods");
    expect(data.retailIndexes).toHaveProperty("Industrial Supplies");

    cleanupTestDataRoot(dataRoot);
  });

  it("calculator-live.json matches required schema", async () => {
    const dataRoot = createTestDataRoot("calculator-live.json matches required schema");
    runExportPipeline(dataRoot, [0]);

    const data = await fetchPublicData(dataRoot, 0, "calculator-live.json");

    expect(data).toHaveProperty("generatedAt");
    expect(data).toHaveProperty("realm", 0);
    expect(data).toHaveProperty("economyPhase");
    expect(["Boom", "Normal", "Recession"]).toContain(data.economyPhase);
    expect(data).toHaveProperty("weatherMultiplier");
    expect(data).toHaveProperty("livePrices");
    expect(data).toHaveProperty("saturation");
    expect(data).toHaveProperty("source");
    expect(data).toHaveProperty("dataFreshnessMinutes");

    // livePrices structure: record<productId, record<quality, price>>
    expect(typeof data.livePrices).toBe("object");
    expect(typeof data.saturation).toBe("object");

    // Verify nested structure
    for (const [productId, qualities] of Object.entries(data.livePrices)) {
      expect(typeof qualities).toBe("object");
      for (const [quality, price] of Object.entries(qualities as Record<string, number>)) {
        expect(typeof price).toBe("number");
        expect(price).toBeGreaterThan(0);
      }
    }

    // Verify saturation structure matches
    for (const [productId, qualities] of Object.entries(data.saturation)) {
      expect(typeof qualities).toBe("object");
      for (const [quality, sat] of Object.entries(qualities as Record<string, number>)) {
        expect(typeof sat).toBe("number");
        expect(sat).toBeGreaterThan(0);
      }
    }

    cleanupTestDataRoot(dataRoot);
  });

  it("manifest.json enables frontend to discover all files", async () => {
    const dataRoot = createTestDataRoot("manifest.json enables frontend to discover all files");
    runExportPipeline(dataRoot, [0, 1]);

    const manifest = await fetchManifest(dataRoot);

    expect(manifest).toHaveProperty("version", "1.0.0");
    expect(manifest).toHaveProperty("generatedAt");
    expect(manifest).toHaveProperty("realms", [0, 1]);
    expect(manifest).toHaveProperty("files");
    expect(Array.isArray(manifest.files)).toBe(true);
    expect(manifest.files.length).toBe(14); // 7 data files * 2 realms

    for (const f of manifest.files) {
      expect(f).toHaveProperty("path");
      expect(f).toHaveProperty("bytes");
      expect(typeof f.path).toBe("string");
      expect(typeof f.bytes).toBe("number");
      expect(f.bytes).toBeGreaterThan(0);
    }

    cleanupTestDataRoot(dataRoot);
  });

  it("data contracts are compatible: backend export -> frontend types", async () => {
    const dataRoot = createTestDataRoot("data contracts are compatible");
    runExportPipeline(dataRoot, [0]);

    // Test that frontend's fetch functions would work with exported data
    const macro = await fetchPublicData(dataRoot, 0, "macro.json");
    expect(() => {
      const result = {
        latestHistory: {
          date: macro.generatedAt,
          companiesValue: macro.latest.companiesValue,
          activeCompanies: macro.latest.activeCompanies,
          bondsSold: macro.latest.bondsSold,
          totalBuildings: macro.latest.totalBuildings,
        },
        latestIndexes: macro.latestIndexes ? {
          cpi: macro.latestIndexes.cpi ?? null,
          coreCpi: macro.latestIndexes.coreCpi ?? null,
          gdp: macro.latestIndexes.gdp ?? null,
        } : null,
        latestInflation: macro.latestInflation ? {
          cpiRate: macro.latestInflation.cpiRate ?? null,
          coreCpiRate: macro.latestInflation.coreCpiRate ?? null,
          gdpGrowth: macro.latestInflation.gdpGrowth ?? null,
        } : null,
      };
      expect(result.latestHistory.companiesValue).toBe(1000000000);
      expect(result.latestIndexes?.cpi).toBe(105.5);
    }).not.toThrow();

    const margins = await fetchPublicData(dataRoot, 0, "margins.json");
    expect(() => {
      const result = {
        ts: new Date().toISOString(),
        realm: 0,
        resources: margins.map((r: any) => ({
          id: r.i,
          name: r.n,
          category: r.c,
          categoryName: r.cn,
          producedPerHour: r.ph,
          revenuePerHour: r.rv,
          inputCostPerHour: r.ic,
          wagesPerHour: r.wg,
          transportPerHour: r.tr,
          netProfitPerHour: r.np,
          marginPct: r.mg,
          marginDelta: (r.m1 as number) ?? null,
          profitDelta: (r.n1 as number) ?? null,
          marginDirection: (r.md as string) ?? null,
          forecastMargin: (r.fp as number) ?? null,
          trendDirection: (r.td as string) ?? null,
          outputVwap: r.vw,
        })),
        total: margins.length,
      };
      expect(result.resources.length).toBe(10);
      expect(result.resources[0].id).toBe(1);
      expect(result.resources[0].marginPct).toBe(87.6);
    }).not.toThrow();

    const calcLive = await fetchPublicData(dataRoot, 0, "calculator-live.json");
    expect(() => {
      expect(calcLive).toHaveProperty("generatedAt");
      expect(calcLive).toHaveProperty("realm", 0);
      expect(calcLive).toHaveProperty("economyPhase");
      expect(calcLive).toHaveProperty("weatherMultiplier");
      expect(calcLive).toHaveProperty("livePrices");
      expect(calcLive).toHaveProperty("saturation");
      expect(calcLive).toHaveProperty("source");
      expect(calcLive).toHaveProperty("dataFreshnessMinutes");
    }).not.toThrow();

    cleanupTestDataRoot(dataRoot);
  });

  it("validation passes for all exported datasets", async () => {
    const dataRoot = createTestDataRoot("validation passes for all exported datasets");
    runExportPipeline(dataRoot, [0]);

    function validatePublicDataset(type: string, data: any): { valid: boolean; errors: string[] } {
      const result = { valid: true, errors: [] as string[] };

      if (!data) {
        result.valid = false;
        result.errors.push(`${type}: Data is null or undefined`);
        return result;
      }

      switch (type) {
        case "macro":
          if (!data.latest) {
            result.valid = false;
            result.errors.push("macro: Missing latest metrics");
          } else if (data.latest.activeCompanies === 0 || data.latest.companiesValue === 0) {
            result.valid = false;
            result.errors.push("macro: Active companies or value is zero");
          }
          break;
        case "margins":
          if (!Array.isArray(data)) {
            result.valid = false;
            result.errors.push("margins: Expected an array");
          } else if (data.length < 10) {
            result.valid = false;
            result.errors.push(`margins: Too few resources (${data.length})`);
          } else {
            const zeroPrices = data.filter((r: any) => r.vw === 0);
            if (zeroPrices.length > data.length * 0.3) {
              result.valid = false;
              result.errors.push(`margins: High percentage of zero prices (${zeroPrices.length}/${data.length})`);
            }
          }
          break;
        case "history":
        case "indexes":
        case "inflation":
          if (!Array.isArray(data)) {
            result.valid = false;
            result.errors.push(`${type}: Expected an array`);
          } else if (data.length === 0) {
            result.valid = false;
            result.errors.push(`${type}: Array is empty`);
          }
          break;
        case "calculator-live":
          if (!data.livePrices || Object.keys(data.livePrices).length === 0) {
            result.valid = false;
            result.errors.push("calculator-live: No live prices data");
          }
          if (!data.saturation || Object.keys(data.saturation).length === 0) {
            result.valid = false;
            result.errors.push("calculator-live: No saturation data");
          }
          if (!["Boom", "Normal", "Recession"].includes(data.economyPhase)) {
            result.valid = false;
            result.errors.push(`calculator-live: Invalid economy phase: ${data.economyPhase}`);
          }
          break;
      }

      return result;
    }

    const macro = await fetchPublicData(dataRoot, 0, "macro.json");
    const history = await fetchPublicData(dataRoot, 0, "history.json");
    const indexes = await fetchPublicData(dataRoot, 0, "indexes.json");
    const inflation = await fetchPublicData(dataRoot, 0, "inflation.json");
    const margins = await fetchPublicData(dataRoot, 0, "margins.json");
    const retail = await fetchPublicData(dataRoot, 0, "retail.json");
    const calcLive = await fetchPublicData(dataRoot, 0, "calculator-live.json");

    const validations = [
      validatePublicDataset("macro", macro),
      validatePublicDataset("history", history),
      validatePublicDataset("indexes", indexes),
      validatePublicDataset("inflation", inflation),
      validatePublicDataset("margins", margins),
      validatePublicDataset("retail", retail),
      validatePublicDataset("calculator-live", calcLive),
    ];

    for (const v of validations) {
      expect(v.valid).toBe(true);
      expect(v.errors.length).toBe(0);
    }

    cleanupTestDataRoot(dataRoot);
  });
});
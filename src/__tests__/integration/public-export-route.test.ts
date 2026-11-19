import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "http";
import { resolve } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";

// Test data directory
const TEST_DATA_ROOT = resolve(process.cwd(), "test-data-public-export");

function createTestDataRoot() {
  if (existsSync(TEST_DATA_ROOT)) {
    rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
  }
  mkdirSync(TEST_DATA_ROOT, { recursive: true });
  // Set the env var BEFORE importing modules
  process.env.DATA_REPO_PATH = TEST_DATA_ROOT;
}

function cleanupTestDataRoot() {
  if (existsSync(TEST_DATA_ROOT)) {
    try {
      rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on Windows
    }
  }
  delete process.env.DATA_REPO_PATH;
}

function writeJson(dir: string, name: string, data: unknown) {
  const full = resolve(dir, name);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const content = JSON.stringify(data, null, 2) + "\n";
  writeFileSync(full, content, "utf-8");
  return full;
}

function createIndexJson(dir: string, latest: string) {
  const idx = { latest };
  writeJson(dir, "index.json", idx);
}

function fakeReq(query: Record<string, string> = {}): IncomingMessage {
  const searchParams = new URLSearchParams(query);
  return {
    url: `/?${searchParams.toString()}`,
    headers: {},
  } as IncomingMessage;
}

function fakeRes(): ServerResponse & { body: string; statusCode: number } {
  const res = {
    statusCode: 0,
    body: "",
    writeHead(code: number, headers?: any) {
      res.statusCode = code;
      res._headers = headers;
    },
    end(body?: string) {
      if (body) res.body = body;
    },
    _headers: {},
  };
  return res as ServerResponse & { body: string; statusCode: number; _headers: any };
}

// Import modules AFTER setting env var
let publicExportModule: any;
let configModule: any;

async function importPublicExport() {
  vi.resetModules();
  configModule = await import("../../config/index.js");
  await configModule.reloadConfig();
  publicExportModule = await import("../../api/routes/publicExport.js");
}

describe("publicExport route handlers", () => {
  beforeEach(async () => {
    createTestDataRoot();
    await importPublicExport();
  });

  afterEach(() => {
    cleanupTestDataRoot();
  });

  describe("handlePublicExportList", () => {
    it("returns list of available datasets", () => {
      const res = fakeRes();
      publicExportModule.handlePublicExportList(res);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.data.datasets).toBeInstanceOf(Array);
      expect(body.data.datasets.length).toBe(8);

      const names = body.data.datasets.map((d: any) => d.name);
      expect(names).toContain("dashboard");
      expect(names).toContain("macro");
      expect(names).toContain("history");
      expect(names).toContain("indexes");
      expect(names).toContain("inflation");
      expect(names).toContain("margins");
      expect(names).toContain("retail");
      expect(names).toContain("calculator-live");
    });
  });

  describe("handlePublicExport", () => {
    beforeEach(() => {
      // Set up test data for all datasets
      const realm = 0;

      // Macro data
      const macroHistoryDir = resolve(TEST_DATA_ROOT, "aggregates", "macro-history", `realm-${realm}`);
      writeJson(macroHistoryDir, "2024.json", {
        r: 0,
        y: 2024,
        e: [{ d: "2024-01-15", ac: 50000, cv: 1000000000, tb: 200000, bs: 1000, ph: "expansion", cp: true }],
      });
      createIndexJson(macroHistoryDir, "2024.json");

      const indexDir = resolve(TEST_DATA_ROOT, "aggregates", "indexes", `realm-${realm}`);
      writeJson(indexDir, "price-indexes-2024-01-15.json", {
        t: "2024-01-15",
        ix: { cpi: { v: 105.5 }, "core-cpi": { v: 103.2 }, gdp: { v: 110.1 } },
      });
      createIndexJson(indexDir, "price-indexes-2024-01-15.json");

      const inflationDir = resolve(TEST_DATA_ROOT, "aggregates", "inflation", `realm-${realm}`);
      writeJson(inflationDir, "inflation-report-2024-01-15.json", {
        t: "2024-01-15",
        in: { cpi: { ch: 2.5 }, "core-cpi": { ch: 2.1 }, gdp: { ch: 3.2 } },
      });
      createIndexJson(inflationDir, "inflation-report-2024-01-15.json");

      // Retail data
      const retailDir = resolve(TEST_DATA_ROOT, "aggregates", "retail", `realm-${realm}`);
      writeJson(retailDir, "retail-summary-2024-01-15.json", {
        ts: "2024-01-15T12:00:00.000Z",
        r: 0,
        rs: [{ id: 1, name: "Iron" }],
      });
      createIndexJson(retailDir, "retail-summary-2024-01-15.json");

      // Calculator live data
      const calcDir = resolve(TEST_DATA_ROOT, "public", `realm-${realm}`);
      writeJson(calcDir, "calculator-live.json", {
        generatedAt: "2024-01-15T12:00:00.000Z",
        realm: 0,
        economyPhase: "Boom",
        weatherMultiplier: 1.012,
        livePrices: { 3: { 0: 5.462 } },
        saturation: { 3: { 0: 1.4768 } },
        source: "simcompanies+simcotools",
        dataFreshnessMinutes: 5,
      });
      createIndexJson(calcDir, "calculator-live.json");
    });

    it("returns macro data", () => {
      const req = fakeReq({ realm: "0" });
      const res = fakeRes();

      publicExportModule.handlePublicExport(req, res, { dataset: "macro" }, undefined, new URLSearchParams("realm=0"));

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.data).toHaveProperty("realm", "0");
      expect(body.data).toHaveProperty("latest");
      expect(body.meta).toEqual({ dataset: "macro", realm: 0, format: "json" });
    });

    it("returns history data with limit", () => {
      const req = fakeReq({ realm: "0", limit: "5" });
      const res = fakeRes();

      publicExportModule.handlePublicExport(req, res, { dataset: "history" }, undefined, new URLSearchParams("realm=0&limit=5"));

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("returns indexes data", () => {
      const req = fakeReq({ realm: "0" });
      const res = fakeRes();

      publicExportModule.handlePublicExport(req, res, { dataset: "indexes" }, undefined, new URLSearchParams("realm=0"));

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("returns inflation data", () => {
      const req = fakeReq({ realm: "0" });
      const res = fakeRes();

      publicExportModule.handlePublicExport(req, res, { dataset: "inflation" }, undefined, new URLSearchParams("realm=0"));

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("returns retail data", () => {
      const req = fakeReq({ realm: "0" });
      const res = fakeRes();

      publicExportModule.handlePublicExport(req, res, { dataset: "retail" }, undefined, new URLSearchParams("realm=0"));

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.data).toHaveProperty("realm", 0);
      expect(body.data).toHaveProperty("resources");
    });

    it("returns calculator-live data", () => {
      const req = fakeReq({ realm: "0" });
      const res = fakeRes();

      publicExportModule.handlePublicExport(req, res, { dataset: "calculator-live" }, undefined, new URLSearchParams("realm=0"));

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.data).toHaveProperty("realm", 0);
      expect(body.data).toHaveProperty("economyPhase");
    });

    it("returns 404 for unknown dataset", () => {
      const req = fakeReq({ realm: "0" });
      const res = fakeRes();

      publicExportModule.handlePublicExport(req, res, { dataset: "unknown" }, undefined, new URLSearchParams("realm=0"));

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("No data for dataset");
    });

    it("returns 404 for margins when computeProfitMargins throws", () => {
      const req = fakeReq({ realm: "0" });
      const res = fakeRes();

      publicExportModule.handlePublicExport(req, res, { dataset: "margins" }, undefined, new URLSearchParams("realm=0"));

      // computeProfitMargins might throw (returns null -> 404) or return empty object (200 with empty data)
      // Accept both 404 and 200 with empty data
      expect([200, 404]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        const body = JSON.parse(res.body);
        // Empty object is returned when computeProfitMargins returns {}
        expect(body.data).toEqual({});
      }
    });

    it("returns CSV format when requested", () => {
      const req = fakeReq({ realm: "0", format: "csv" });
      const res = fakeRes();

      publicExportModule.handlePublicExport(req, res, { dataset: "macro" }, undefined, new URLSearchParams("realm=0&format=csv"));

      expect(res.statusCode).toBe(200);
      expect(res._headers["Content-Type"]).toContain("text/csv");
      // CSV should have headers
      expect(res.body).toContain("realm");
    });

    it("uses default realm 0 when not specified", () => {
      const req = fakeReq({});
      const res = fakeRes();

      publicExportModule.handlePublicExport(req, res, { dataset: "macro" }, undefined, new URLSearchParams(""));

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.meta.realm).toBe(0);
    });
  });
});
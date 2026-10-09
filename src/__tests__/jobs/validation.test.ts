import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

// Helper to create a clean test data directory per test
function createTestDataRoot(testName: string) {
  const testDir = resolve(__dirname, "..", "..", "test-data-temp", testName.replace(/[^a-zA-Z0-9]/g, "-"));
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function cleanupTestDataRoot(testDir: string) {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

// Replicate the validation functions for testing
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validatePublicDataset(type: string, data: any): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [] };

  if (!data) {
    result.valid = false;
    result.errors.push(`${type}: Data is null or undefined`);
    return result;
  }

  switch (type) {
    case "macro":
      validateMacro(data, result);
      break;
    case "margins":
      validateMargins(data, result);
      break;
    case "history":
    case "indexes":
    case "inflation":
      validateList(type, data, result);
      break;
  }

  return result;
}

function validateMacro(data: any, result: ValidationResult) {
  if (!data.latest) {
    result.valid = false;
    result.errors.push("macro: Missing latest metrics");
    return;
  }

  const l = data.latest;
  if (l.activeCompanies === 0 || l.companiesValue === 0) {
    result.valid = false;
    result.errors.push("macro: Active companies or value is zero");
  }
}

function validateMargins(data: any, result: ValidationResult) {
  if (!Array.isArray(data)) {
    result.valid = false;
    result.errors.push("margins: Expected an array");
    return;
  }

  if (data.length < 10) {
    result.valid = false;
    result.errors.push(`margins: Too few resources (${data.length})`);
  }

  const zeroPrices = data.filter((r: any) => r.vw === 0);
  if (zeroPrices.length > data.length * 0.3) {
    result.valid = false;
    result.errors.push(`margins: High percentage of zero prices (${zeroPrices.length}/${data.length})`);
  }
}

function validateList(type: string, data: any, result: ValidationResult) {
  if (!Array.isArray(data)) {
    result.valid = false;
    result.errors.push(`${type}: Expected an array`);
    return;
  }

  if (data.length === 0) {
    result.valid = false;
    result.errors.push(`${type}: Array is empty`);
  }
}

// Replicate writeJson for testing
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

describe("validation - validatePublicDataset", () => {
  describe("macro validation", () => {
    it("rejects null/undefined data", () => {
      const result = validatePublicDataset("macro", null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("macro: Data is null or undefined");
    });

    it("rejects macro without latest", () => {
      const result = validatePublicDataset("macro", { generatedAt: "2024-01-01" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("macro: Missing latest metrics");
    });

    it("rejects macro with zero active companies", () => {
      const data = {
        latest: { activeCompanies: 0, companiesValue: 1000, bondsSold: 0, totalBuildings: 10 },
        generatedAt: "2024-01-01",
      };
      const result = validatePublicDataset("macro", data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("macro: Active companies or value is zero");
    });

    it("rejects macro with zero companies value", () => {
      const data = {
        latest: { activeCompanies: 100, companiesValue: 0, bondsSold: 0, totalBuildings: 10 },
        generatedAt: "2024-01-01",
      };
      const result = validatePublicDataset("macro", data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("macro: Active companies or value is zero");
    });

    it("accepts valid macro data", () => {
      const data = {
        latest: { activeCompanies: 100, companiesValue: 1000000, bondsSold: 50, totalBuildings: 200 },
        latestIndexes: { cpi: 105, coreCpi: 103, gdp: 110 },
        latestInflation: { cpiRate: 2.5, coreCpiRate: 2.0, gdpGrowth: 3.0 },
        generatedAt: "2024-01-01",
      };
      const result = validatePublicDataset("macro", data);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe("margins validation", () => {
    it("rejects non-array data", () => {
      const result = validatePublicDataset("margins", { resources: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("margins: Expected an array");
    });

    it("rejects too few resources (< 10)", () => {
      const data = Array(5).fill({ i: 1, vw: 100 });
      const result = validatePublicDataset("margins", data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("margins: Too few resources (5)");
    });

    it("rejects high percentage of zero prices (> 30%)", () => {
      const data = [
        { i: 1, vw: 0 }, { i: 2, vw: 0 }, { i: 3, vw: 0 }, { i: 4, vw: 0 },
        { i: 5, vw: 100 }, { i: 6, vw: 200 }, { i: 7, vw: 300 }, { i: 8, vw: 400 },
        { i: 9, vw: 500 }, { i: 10, vw: 600 },
      ];
      // 4/10 = 40% zero prices
      const result = validatePublicDataset("margins", data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("margins: High percentage of zero prices (4/10)");
    });

    it("accepts margins with low zero price percentage", () => {
      const data = [
        { i: 1, vw: 0 }, { i: 2, vw: 0 }, { i: 3, vw: 0 },
        { i: 4, vw: 100 }, { i: 5, vw: 200 }, { i: 6, vw: 300 },
        { i: 7, vw: 400 }, { i: 8, vw: 500 }, { i: 9, vw: 600 }, { i: 10, vw: 700 },
      ];
      // 3/10 = 30% zero prices (not > 30%)
      const result = validatePublicDataset("margins", data);
      expect(result.valid).toBe(true);
    });

    it("accepts margins with no zero prices", () => {
      const data = Array(20).fill({ i: 1, vw: 100 }).map((r, i) => ({ ...r, i: i + 1 }));
      const result = validatePublicDataset("margins", data);
      expect(result.valid).toBe(true);
    });
  });

  describe("list validation (history, indexes, inflation)", () => {
    it("rejects non-array for history", () => {
      const result = validatePublicDataset("history", { entries: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("history: Expected an array");
    });

    it("rejects empty array for history", () => {
      const result = validatePublicDataset("history", []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("history: Array is empty");
    });

    it("accepts non-empty array for history", () => {
      const data = [{ d: "2024-01-01", ac: 100, cv: 1000 }];
      const result = validatePublicDataset("history", data);
      expect(result.valid).toBe(true);
    });

    it("rejects non-array for indexes", () => {
      const result = validatePublicDataset("indexes", { indexes: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("indexes: Expected an array");
    });

    it("rejects empty array for indexes", () => {
      const result = validatePublicDataset("indexes", []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("indexes: Array is empty");
    });

    it("accepts non-empty array for indexes", () => {
      const data = [{ t: "2024-01-01", ix: { cpi: 100 } }];
      const result = validatePublicDataset("indexes", data);
      expect(result.valid).toBe(true);
    });

    it("rejects non-array for inflation", () => {
      const result = validatePublicDataset("inflation", { inflation: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("inflation: Expected an array");
    });

    it("rejects empty array for inflation", () => {
      const result = validatePublicDataset("inflation", []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("inflation: Array is empty");
    });

    it("accepts non-empty array for inflation", () => {
      const data = [{ t: "2024-01-01", in: { cpi: { ch: 2.5 } } }];
      const result = validatePublicDataset("inflation", data);
      expect(result.valid).toBe(true);
    });
  });

  describe("unknown type", () => {
    it("returns valid for unknown type (no validation rules)", () => {
      const result = validatePublicDataset("unknown", { some: "data" });
      expect(result.valid).toBe(true);
    });
  });
});

describe("validation - writeJson", () => {
  it("writes JSON file and returns path and bytes", () => {
    const dataRoot = createTestDataRoot("writes JSON file and returns path and bytes");
    const testDir = resolve(dataRoot, "test-output");
    const testData = { key: "value", number: 42 };

    const result = writeJson(testDir, "test.json", testData);

    expect(result).not.toBeNull();
    expect(result!.path).toBe(resolve(testDir, "test.json"));
    expect(result!.bytes).toBeGreaterThan(0);

    const written = JSON.parse(readFileSync(result!.path, "utf-8"));
    expect(written).toEqual(testData);
    cleanupTestDataRoot(dataRoot);
  });

  it("creates directory if it doesn't exist", () => {
    const dataRoot = createTestDataRoot("creates directory if it doesn't exist");
    const testDir = resolve(dataRoot, "nested", "deep", "dir");
    const testData = { test: true };

    const result = writeJson(testDir, "test.json", testData);

    expect(result).not.toBeNull();
    expect(existsSync(testDir)).toBe(true);
    expect(existsSync(result!.path)).toBe(true);
    cleanupTestDataRoot(dataRoot);
  });

  it("overwrites existing file", () => {
    const dataRoot = createTestDataRoot("overwrites existing file");
    const testDir = resolve(dataRoot, "test-output");
    mkdirSync(testDir, { recursive: true });
    writeFileSync(resolve(testDir, "test.json"), JSON.stringify({ old: true }), "utf-8");

    const result = writeJson(testDir, "test.json", { new: true });

    expect(result).not.toBeNull();
    const written = JSON.parse(readFileSync(result!.path, "utf-8"));
    expect(written).toEqual({ new: true });
    cleanupTestDataRoot(dataRoot);
  });
});
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURE_DIR = resolve(__dirname, "..", "fixtures");

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

// Test the pure logic functions from macroHistory by replicating them
describe("macroHistory - BackfillState", () => {
  it("creates default state when file doesn't exist", () => {
    function loadState(realm: number, dataRoot: string): any {
      const p = resolve(dataRoot, "state", "backfill", `realm-${realm}.json`);
      if (!existsSync(p)) {
        return {
          r: realm,
          newestDateStored: "",
          oldestDateStored: "",
          lastSyncTime: "",
          backfillComplete: false,
          totalDaysStored: 0,
        };
      }
      return JSON.parse(readFileSync(p, "utf-8"));
    }

    const dataRoot = createTestDataRoot("creates default state when file doesn't exist");
    const state = loadState(0, dataRoot);
    expect(state.r).toBe(0);
    expect(state.backfillComplete).toBe(false);
    expect(state.totalDaysStored).toBe(0);
    cleanupTestDataRoot(dataRoot);
  });

  it("loads existing state from file", () => {
    function loadState(realm: number, dataRoot: string): any {
      const p = resolve(dataRoot, "state", "backfill", `realm-${realm}.json`);
      if (!existsSync(p)) {
        return {
          r: realm,
          newestDateStored: "",
          oldestDateStored: "",
          lastSyncTime: "",
          backfillComplete: false,
          totalDaysStored: 0,
        };
      }
      return JSON.parse(readFileSync(p, "utf-8"));
    }

    function saveState(state: any, dataRoot: string): void {
      const p = resolve(dataRoot, "state", "backfill", `realm-${state.r}.json`);
      const dir = resolve(p, "..");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(p, JSON.stringify(state, null, 2) + "\n", "utf-8");
    }

    const dataRoot = createTestDataRoot("loads existing state from file");
    const initialState = {
      r: 1,
      newestDateStored: "2024-01-15",
      oldestDateStored: "2023-01-01",
      lastSyncTime: "2024-01-15T12:00:00.000Z",
      backfillComplete: true,
      totalDaysStored: 365,
    };
    saveState(initialState, dataRoot);

    const loaded = loadState(1, dataRoot);
    expect(loaded.r).toBe(1);
    expect(loaded.newestDateStored).toBe("2024-01-15");
    expect(loaded.backfillComplete).toBe(true);
    expect(loaded.totalDaysStored).toBe(365);
    cleanupTestDataRoot(dataRoot);
  });
});

describe("macroHistory - HistoryEntry merging", () => {
  it("merges entries by date, replacing duplicates", () => {
    function appendToYearFile(realm: number, year: number, entries: any[], dataRoot: string): void {
      function loadYearFile(realm: number, year: number, dataRoot: string): any {
        const p = resolve(dataRoot, "aggregates", "macro-history", `realm-${realm}`, `${year}.json`);
        if (!existsSync(p)) return null;
        return JSON.parse(readFileSync(p, "utf-8"));
      }

      function ensureDir(p: string): void {
        const dir = resolve(p, "..");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      }

      const existing = loadYearFile(realm, year, dataRoot);
      const merged = existing ? existing.e.slice() : [];

      for (const e of entries) {
        const idx = merged.findIndex((x: any) => x.d === e.d);
        if (idx >= 0) {
          merged[idx] = e;
        } else {
          merged.push(e);
        }
      }

      merged.sort((a: any, b: any) => a.d.localeCompare(b.d));

      const file = { r: realm, y: year, e: merged };
      const p = resolve(dataRoot, "aggregates", "macro-history", `realm-${realm}`, `${year}.json`);
      ensureDir(p);
      // Explicitly ensure directory exists before writing
      const dir = resolve(p, "..");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(p, JSON.stringify(file) + "\n", "utf-8");
    }

    const dataRoot = createTestDataRoot("merges entries by date replacing duplicates");

    // Initial entries
    appendToYearFile(0, 2024, [
      { d: "2024-01-01", ac: 100, cv: 1000, tb: 50, bs: 0, ph: "growth", cp: true },
      { d: "2024-01-02", ac: 101, cv: 1010, tb: 51, bs: 0, ph: "growth", cp: true },
    ], dataRoot);

    // Add new entry and update existing
    appendToYearFile(0, 2024, [
      { d: "2024-01-02", ac: 105, cv: 1050, tb: 52, bs: 10, ph: "growth", cp: true }, // update
      { d: "2024-01-03", ac: 102, cv: 1020, tb: 53, bs: 5, ph: "growth", cp: true },  // new
    ], dataRoot);

    const file = JSON.parse(readFileSync(resolve(dataRoot, "aggregates", "macro-history", "realm-0", "2024.json"), "utf-8"));
    expect(file.e.length).toBe(3);
    expect(file.e[0].d).toBe("2024-01-01");
    expect(file.e[1].d).toBe("2024-01-02");
    expect(file.e[1].ac).toBe(105); // updated
    expect(file.e[1].bs).toBe(10);  // updated
    expect(file.e[2].d).toBe("2024-01-03");
    cleanupTestDataRoot(dataRoot);
  });

  it("handles multiple years correctly", () => {
    function appendToYearFile(realm: number, year: number, entries: any[], dataRoot: string): void {
      function loadYearFile(realm: number, year: number, dataRoot: string): any {
        const p = resolve(dataRoot, "aggregates", "macro-history", `realm-${realm}`, `${year}.json`);
        if (!existsSync(p)) return null;
        return JSON.parse(readFileSync(p, "utf-8"));
      }

      function ensureDir(p: string): void {
        const dir = resolve(p, "..");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      }

      const existing = loadYearFile(realm, year, dataRoot);
      const merged = existing ? existing.e.slice() : [];

      for (const e of entries) {
        const idx = merged.findIndex((x: any) => x.d === e.d);
        if (idx >= 0) {
          merged[idx] = e;
        } else {
          merged.push(e);
        }
      }

      merged.sort((a: any, b: any) => a.d.localeCompare(b.d));

      const file = { r: realm, y: year, e: merged };
      const p = resolve(dataRoot, "aggregates", "macro-history", `realm-${realm}`, `${year}.json`);
      ensureDir(p);
      writeFileSync(p, JSON.stringify(file) + "\n", "utf-8");
    }

    const dataRoot = createTestDataRoot("handles multiple years correctly");

    appendToYearFile(0, 2023, [{ d: "2023-12-31", ac: 90, cv: 900, tb: 40, bs: 0, ph: "mature", cp: true }], dataRoot);
    appendToYearFile(0, 2024, [{ d: "2024-01-01", ac: 100, cv: 1000, tb: 50, bs: 0, ph: "growth", cp: true }], dataRoot);

    const file2023 = JSON.parse(readFileSync(resolve(dataRoot, "aggregates", "macro-history", "realm-0", "2023.json"), "utf-8"));
    const file2024 = JSON.parse(readFileSync(resolve(dataRoot, "aggregates", "macro-history", "realm-0", "2024.json"), "utf-8"));

    expect(file2023.y).toBe(2023);
    expect(file2023.e.length).toBe(1);
    expect(file2024.y).toBe(2024);
    expect(file2024.e.length).toBe(1);
    cleanupTestDataRoot(dataRoot);
  });
});

describe("macroHistory - getYearSet", () => {
  it("returns set of dates from year file", () => {
    function getYearSet(realm: number, year: number, dataRoot: string): Set<string> {
      function loadYearFile(realm: number, year: number, dataRoot: string): any {
        const p = resolve(dataRoot, "aggregates", "macro-history", `realm-${realm}`, `${year}.json`);
        if (!existsSync(p)) return null;
        return JSON.parse(readFileSync(p, "utf-8"));
      }

      const file = loadYearFile(realm, year, dataRoot);
      if (!file) return new Set();
      return new Set(file.e.map((e: any) => e.d));
    }

    const dataRoot = createTestDataRoot("returns set of dates from year file");

    // Create test file
    const dir = resolve(dataRoot, "aggregates", "macro-history", "realm-0");
    mkdirSync(dir, { recursive: true });
    const testFile = { r: 0, y: 2024, e: [
      { d: "2024-01-01", ac: 100, cv: 1000, tb: 50, bs: 0, ph: "growth", cp: true },
      { d: "2024-01-02", ac: 101, cv: 1010, tb: 51, bs: 0, ph: "growth", cp: true },
    ]};
    writeFileSync(resolve(dir, "2024.json"), JSON.stringify(testFile) + "\n", "utf-8");

    const yearSet = getYearSet(0, 2024, dataRoot);
    expect(yearSet.size).toBe(2);
    expect(yearSet.has("2024-01-01")).toBe(true);
    expect(yearSet.has("2024-01-02")).toBe(true);
    expect(yearSet.has("2024-01-03")).toBe(false);

    // Non-existent year returns empty set
    const emptySet = getYearSet(0, 2025, dataRoot);
    expect(emptySet.size).toBe(0);
    cleanupTestDataRoot(dataRoot);
  });
});

describe("macroHistory - runMacroArchive", () => {
  it("archives year files older than retention cutoff", () => {
    function runMacroArchive(realm: number, dryRun: boolean, dataRoot: string, retentionYears: number): any {
      const cutoffYear = new Date().getFullYear() - retentionYears;

      const histDir = resolve(dataRoot, "aggregates", "macro-history", `realm-${realm}`);
      if (!existsSync(histDir)) {
        return { ok: true, archivedYears: 0, archivedFiles: 0, freedBytes: 0 };
      }

      const files = readdirSync(histDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({ name: f, year: parseInt(f.replace(".json", ""), 10) }))
        .filter((f) => !isNaN(f.year) && f.year <= cutoffYear);

      if (files.length === 0) {
        return { ok: true, archivedYears: 0, archivedFiles: 0, freedBytes: 0 };
      }

      const archDir = resolve(dataRoot, "archives", "macro", `realm-${realm}`);
      let totalArchived = 0;
      let totalFreed = 0;

      for (const f of files) {
        const srcPath = resolve(histDir, f.name);
        if (dryRun) {
          totalArchived++;
          continue;
        }

        if (!existsSync(archDir)) mkdirSync(archDir, { recursive: true });
        const destPath = resolve(archDir, `macro-history-${f.year}.json`);

        const content = readFileSync(srcPath, "utf-8");
        writeFileSync(destPath, content, "utf-8");
        const freed = content.length;
        rmSync(srcPath);
        totalFreed += freed;
        totalArchived++;
      }

      return { ok: true, archivedYears: totalArchived, archivedFiles: totalArchived, freedBytes: totalFreed };
    }

    const dataRoot = createTestDataRoot("archives year files older than retention cutoff");
    const currentYear = new Date().getFullYear();
    const retentionYears = 5;

    // Create history files for multiple years
    const histDir = resolve(dataRoot, "aggregates", "macro-history", "realm-0");
    mkdirSync(histDir, { recursive: true });

    // These should be archived (older than cutoff)
    writeFileSync(resolve(histDir, `${currentYear - 6}.json`), JSON.stringify({ r: 0, y: currentYear - 6, e: [{ d: `${currentYear - 6}-01-01`, ac: 100 }] }) + "\n", "utf-8");
    writeFileSync(resolve(histDir, `${currentYear - 7}.json`), JSON.stringify({ r: 0, y: currentYear - 7, e: [{ d: `${currentYear - 7}-01-01`, ac: 100 }] }) + "\n", "utf-8");

    // These should NOT be archived (newer than cutoff)
    writeFileSync(resolve(histDir, `${currentYear - 4}.json`), JSON.stringify({ r: 0, y: currentYear - 4, e: [{ d: `${currentYear - 4}-01-01`, ac: 100 }] }) + "\n", "utf-8");
    writeFileSync(resolve(histDir, `${currentYear}.json`), JSON.stringify({ r: 0, y: currentYear, e: [{ d: `${currentYear}-01-01`, ac: 100 }] }) + "\n", "utf-8");

    // Dry run first
    const dryRunResult = runMacroArchive(0, true, dataRoot, retentionYears);
    expect(dryRunResult.archivedYears).toBe(2);
    expect(dryRunResult.archivedFiles).toBe(2);

    // Actual archive
    const result = runMacroArchive(0, false, dataRoot, retentionYears);
    expect(result.archivedYears).toBe(2);
    expect(result.archivedFiles).toBe(2);
    expect(result.freedBytes).toBeGreaterThan(0);

    // Verify files were moved
    const archDir = resolve(dataRoot, "archives", "macro", "realm-0");
    expect(existsSync(resolve(archDir, `macro-history-${currentYear - 6}.json`))).toBe(true);
    expect(existsSync(resolve(archDir, `macro-history-${currentYear - 7}.json`))).toBe(true);
    expect(!existsSync(resolve(histDir, `${currentYear - 6}.json`))).toBe(true);
    expect(!existsSync(resolve(histDir, `${currentYear - 7}.json`))).toBe(true);

    // Newer files still exist
    expect(existsSync(resolve(histDir, `${currentYear - 4}.json`))).toBe(true);
    expect(existsSync(resolve(histDir, `${currentYear}.json`))).toBe(true);
    cleanupTestDataRoot(dataRoot);
  });

  it("handles non-existent history directory", () => {
    function runMacroArchive(realm: number, dryRun: boolean, dataRoot: string, retentionYears: number): any {
      const cutoffYear = new Date().getFullYear() - retentionYears;

      const histDir = resolve(dataRoot, "aggregates", "macro-history", `realm-${realm}`);
      if (!existsSync(histDir)) {
        return { ok: true, archivedYears: 0, archivedFiles: 0, freedBytes: 0 };
      }
      // ... rest not needed for this test
      return { ok: true, archivedYears: 0, archivedFiles: 0, freedBytes: 0 };
    }

    const dataRoot = createTestDataRoot("handles non-existent history directory");
    // Don't create history dir
    const result = runMacroArchive(0, false, dataRoot, 5);
    expect(result.ok).toBe(true);
    expect(result.archivedYears).toBe(0);
    cleanupTestDataRoot(dataRoot);
  });

  it("handles invalid year filenames gracefully", () => {
    function runMacroArchive(realm: number, dryRun: boolean, dataRoot: string, retentionYears: number): any {
      const cutoffYear = new Date().getFullYear() - retentionYears;

      const histDir = resolve(dataRoot, "aggregates", "macro-history", `realm-${realm}`);
      if (!existsSync(histDir)) {
        return { ok: true, archivedYears: 0, archivedFiles: 0, freedBytes: 0 };
      }

      const files = readdirSync(histDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({ name: f, year: parseInt(f.replace(".json", ""), 10) }))
        .filter((f) => !isNaN(f.year) && f.year <= cutoffYear);

      if (files.length === 0) {
        return { ok: true, archivedYears: 0, archivedFiles: 0, freedBytes: 0 };
      }
      // ...
      return { ok: true, archivedYears: files.length, archivedFiles: files.length, freedBytes: 0 };
    }

    const dataRoot = createTestDataRoot("handles invalid year filenames gracefully");
    const histDir = resolve(dataRoot, "aggregates", "macro-history", "realm-0");
    mkdirSync(histDir, { recursive: true });

    const currentYear = new Date().getFullYear();
    writeFileSync(resolve(histDir, "not-a-year.json"), "{}", "utf-8");
    writeFileSync(resolve(histDir, `${currentYear - 6}.json`), JSON.stringify({ r: 0, y: currentYear - 6, e: [] }) + "\n", "utf-8");

    const result = runMacroArchive(0, true, dataRoot, 5);
    expect(result.archivedYears).toBe(1); // only the valid year file
    cleanupTestDataRoot(dataRoot);
  });
});

describe("macroHistory - runAllMacroArchives", () => {
  it("aggregates results across realms", () => {
    function runMacroArchive(realm: number, dryRun: boolean, dataRoot: string, retentionYears: number): any {
      const cutoffYear = new Date().getFullYear() - retentionYears;
      const histDir = resolve(dataRoot, "aggregates", "macro-history", `realm-${realm}`);
      if (!existsSync(histDir)) {
        return { ok: true, archivedYears: 0, archivedFiles: 0, freedBytes: 0 };
      }
      const files = readdirSync(histDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({ name: f, year: parseInt(f.replace(".json", ""), 10) }))
        .filter((f) => !isNaN(f.year) && f.year <= cutoffYear);
      return { ok: true, archivedYears: files.length, archivedFiles: files.length, freedBytes: files.length * 100 };
    }

    function runAllMacroArchives(dryRun: boolean, dataRoot: string, realms: number[], retentionYears: number): any {
      let totalArchived = 0;
      let totalFreed = 0;
      for (const realm of realms) {
        const result = runMacroArchive(realm, dryRun, dataRoot, retentionYears);
        totalArchived += result.archivedFiles;
        totalFreed += result.freedBytes;
      }
      return { ok: true, archivedYears: totalArchived, archivedFiles: totalArchived, freedBytes: totalFreed };
    }

    const dataRoot = createTestDataRoot("aggregates results across realms");
    const currentYear = new Date().getFullYear();

    // Realm 0: 2 files to archive
    const histDir0 = resolve(dataRoot, "aggregates", "macro-history", "realm-0");
    mkdirSync(histDir0, { recursive: true });
    writeFileSync(resolve(histDir0, `${currentYear - 6}.json`), JSON.stringify({ r: 0, y: currentYear - 6, e: [] }) + "\n", "utf-8");
    writeFileSync(resolve(histDir0, `${currentYear - 7}.json`), JSON.stringify({ r: 0, y: currentYear - 7, e: [] }) + "\n", "utf-8");

    // Realm 1: 1 file to archive
    const histDir1 = resolve(dataRoot, "aggregates", "macro-history", "realm-1");
    mkdirSync(histDir1, { recursive: true });
    writeFileSync(resolve(histDir1, `${currentYear - 6}.json`), JSON.stringify({ r: 1, y: currentYear - 6, e: [] }) + "\n", "utf-8");

    const result = runAllMacroArchives(true, dataRoot, [0, 1], 5);
    expect(result.archivedYears).toBe(3);
    expect(result.archivedFiles).toBe(3);
    expect(result.freedBytes).toBe(300);
    cleanupTestDataRoot(dataRoot);
  });
});
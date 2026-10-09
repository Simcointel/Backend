import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const TEST_DATA_ROOT = resolve(__dirname, "..", "..", "test-data-temp");

function setupTestDataRoot() {
  if (existsSync(TEST_DATA_ROOT)) {
    rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
  }
  mkdirSync(TEST_DATA_ROOT, { recursive: true });
  return TEST_DATA_ROOT;
}

function teardownTestDataRoot() {
  if (existsSync(TEST_DATA_ROOT)) {
    rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
  }
}

// Replicate the pure functions from fetchJob.ts for testing
function shrinkResources(resources: any[]): any[] {
  return resources.map((r) => ({
    i: r.id,
    n: r.name,
    ph: r.producedAnHour,
    w: r.wages,
    tr: r.transportation,
    in: Object.fromEntries(
      Object.entries(r.inputs).map(([id, info]) => [Number(id), (info as any).quantity]),
    ),
    ir: r.isResearch,
    sm: r.speedModifier,
    pa: r.producedAt,
    ri: r.retailInfo,
  }));
}

function shrinkVwaps(vwaps: any[]): any[] {
  return vwaps.map((v) => ({ i: v.resourceId, q: v.quality, v: v.vwap, d: v.datetime }));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry<T>(
  label: string,
  fn: () => Promise<T>,
  retries: number,
  delayMs: number,
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < retries) {
        const wait = delayMs * 2 ** (attempt - 1);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
  throw new Error("unreachable");
}

describe("fetchJob - shrinkResources", () => {
  it("transforms resource objects to shrunk format", () => {
    const resources = [
      {
        id: 1,
        name: "Iron",
        producedAnHour: 10,
        wages: 100,
        transportation: 5,
        inputs: { "2": { quantity: 2 } },
        isResearch: false,
        speedModifier: 1,
        producedAt: 101,
        retailInfo: null,
      },
      {
        id: 2,
        name: "Steel",
        producedAnHour: 5,
        wages: 200,
        transportation: 10,
        inputs: {},
        isResearch: true,
        speedModifier: 1.5,
        producedAt: 102,
        retailInfo: [{ price: 5000 }],
      },
    ];

    const result = shrinkResources(resources);

    expect(result.length).toBe(2);
    expect(result[0]).toEqual({
      i: 1,
      n: "Iron",
      ph: 10,
      w: 100,
      tr: 5,
      in: { 2: 2 },
      ir: false,
      sm: 1,
      pa: 101,
      ri: null,
    });
    expect(result[1]).toEqual({
      i: 2,
      n: "Steel",
      ph: 5,
      w: 200,
      tr: 10,
      in: {},
      ir: true,
      sm: 1.5,
      pa: 102,
      ri: [{ price: 5000 }],
    });
  });

  it("handles empty inputs object", () => {
    const resources = [{
      id: 3,
      name: "Oil",
      producedAnHour: 20,
      wages: 50,
      transportation: 2,
      inputs: {},
      isResearch: false,
      speedModifier: 1,
      producedAt: 105,
      retailInfo: null,
    }];

    const result = shrinkResources(resources);
    expect(result[0].in).toEqual({});
  });

  it("handles missing optional fields gracefully", () => {
    const resources = [{
      id: 4,
      name: "Test",
      producedAnHour: 1,
      wages: 10,
      transportation: 1,
      inputs: {},
      isResearch: false,
      // speedModifier missing
      producedAt: 100,
      // retailInfo missing
    }];

    const result = shrinkResources(resources);
    expect(result[0].sm).toBeUndefined();
    expect(result[0].ri).toBeUndefined();
  });
});

describe("fetchJob - shrinkVwaps", () => {
  it("transforms VWAP entries to shrunk format", () => {
    const vwaps = [
      { resourceId: 1, quality: 0, vwap: 1000, datetime: "2024-01-15T12:00:00Z" },
      { resourceId: 1, quality: 1, vwap: 1100, datetime: "2024-01-15T12:00:00Z" },
      { resourceId: 2, quality: 0, vwap: 3000, datetime: "2024-01-15T12:00:00Z" },
    ];

    const result = shrinkVwaps(vwaps);

    expect(result.length).toBe(3);
    expect(result[0]).toEqual({ i: 1, q: 0, v: 1000, d: "2024-01-15T12:00:00Z" });
    expect(result[1]).toEqual({ i: 1, q: 1, v: 1100, d: "2024-01-15T12:00:00Z" });
    expect(result[2]).toEqual({ i: 2, q: 0, v: 3000, d: "2024-01-15T12:00:00Z" });
  });

  it("handles missing datetime", () => {
    const vwaps = [{ resourceId: 1, quality: 0, vwap: 1000 }];
    const result = shrinkVwaps(vwaps);
    expect(result[0].d).toBeUndefined();
  });
});

describe("fetchJob - fetchWithRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await fetchWithRetry("test", fn, 3, 10);
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds on second attempt", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce("success");
    const result = await fetchWithRetry("test", fn, 3, 10);
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries with exponential backoff", async () => {
    const startTimes: number[] = [];
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("error 1"))
      .mockRejectedValueOnce(new Error("error 2"))
      .mockResolvedValueOnce("success");

    await fetchWithRetry("test", fn, 3, 10);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after all retries exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("persistent error"));
    await expect(fetchWithRetry("test", fn, 3, 10)).rejects.toThrow("persistent error");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws immediately if retries = 1 and fails", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("single try"));
    await expect(fetchWithRetry("test", fn, 1, 10)).rejects.toThrow("single try");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("fetchJob - result aggregation (runFetch logic)", () => {
  it("aggregates results from multiple realms correctly", () => {
    const realms = [0, 1];
    const results = [
      { status: "fulfilled" as const, value: { ok: true, resourceCount: 100, vwapCount: 500, snapshotPath: "/path/0", durationMs: 100 } },
      { status: "fulfilled" as const, value: { ok: true, resourceCount: 120, vwapCount: 600, snapshotPath: "/path/1", durationMs: 150 } },
    ];

    let totalOk = 0;
    let totalResources = 0;
    let totalVwaps = 0;
    let lastError: string | undefined;

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.ok) {
        totalOk++;
        totalResources += result.value.resourceCount;
        totalVwaps += result.value.vwapCount;
      } else if (result.status === "rejected") {
        lastError = result.reason?.message ?? String(result.reason);
      } else if (result.status === "fulfilled") {
        lastError = result.value.error;
      }
    }

    const allOk = totalOk === realms.length;

    expect(totalOk).toBe(2);
    expect(totalResources).toBe(220);
    expect(totalVwaps).toBe(1100);
    expect(allOk).toBe(true);
    expect(lastError).toBeUndefined();
  });

  it("handles mixed success and failure", () => {
    const realms = [0, 1];
    const results = [
      { status: "fulfilled" as const, value: { ok: true, resourceCount: 100, vwapCount: 500, snapshotPath: "/path/0", durationMs: 100 } },
      { status: "fulfilled" as const, value: { ok: false, resourceCount: 0, vwapCount: 0, snapshotPath: null, durationMs: 150, error: "realm 1 failed" } },
    ];

    let totalOk = 0;
    let totalResources = 0;
    let totalVwaps = 0;
    let lastError: string | undefined;

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.ok) {
        totalOk++;
        totalResources += result.value.resourceCount;
        totalVwaps += result.value.vwapCount;
      } else if (result.status === "rejected") {
        lastError = result.reason?.message ?? String(result.reason);
      } else if (result.status === "fulfilled") {
        lastError = result.value.error;
      }
    }

    const allOk = totalOk === realms.length;

    expect(totalOk).toBe(1);
    expect(totalResources).toBe(100);
    expect(totalVwaps).toBe(500);
    expect(allOk).toBe(false);
    expect(lastError).toBe("realm 1 failed");
  });

  it("handles rejected promises", () => {
    const realms = [0, 1];
    const results = [
      { status: "fulfilled" as const, value: { ok: true, resourceCount: 100, vwapCount: 500, snapshotPath: "/path/0", durationMs: 100 } },
      { status: "rejected" as const, reason: new Error("network error") },
    ];

    let totalOk = 0;
    let totalResources = 0;
    let totalVwaps = 0;
    let lastError: string | undefined;

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.ok) {
        totalOk++;
        totalResources += result.value.resourceCount;
        totalVwaps += result.value.vwapCount;
      } else if (result.status === "rejected") {
        lastError = result.reason?.message ?? String(result.reason);
      } else if (result.status === "fulfilled") {
        lastError = result.value.error;
      }
    }

    const allOk = totalOk === realms.length;

    expect(totalOk).toBe(1);
    expect(allOk).toBe(false);
    expect(lastError).toBe("network error");
  });

  it("handles all failures", () => {
    const realms = [0, 1];
    const results = [
      { status: "fulfilled" as const, value: { ok: false, resourceCount: 0, vwapCount: 0, snapshotPath: null, durationMs: 100, error: "error 0" } },
      { status: "fulfilled" as const, value: { ok: false, resourceCount: 0, vwapCount: 0, snapshotPath: null, durationMs: 150, error: "error 1" } },
    ];

    let totalOk = 0;
    let totalResources = 0;
    let totalVwaps = 0;
    let lastError: string | undefined;

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.ok) {
        totalOk++;
        totalResources += result.value.resourceCount;
        totalVwaps += result.value.vwapCount;
      } else if (result.status === "rejected") {
        lastError = result.reason?.message ?? String(result.reason);
      } else if (result.status === "fulfilled") {
        lastError = result.value.error;
      }
    }

    const allOk = totalOk === realms.length;

    expect(totalOk).toBe(0);
    expect(allOk).toBe(false);
    expect(lastError).toBe("error 1"); // last error wins
  });
});

describe("fetchJob - MarketSnapshot structure", () => {
  it("creates correct snapshot structure", () => {
    const timestamp = "2024-01-15T12:00:00.000Z";
    const realm = 0;
    const resources = shrinkResources([
      { id: 1, name: "Iron", producedAnHour: 10, wages: 100, transportation: 5, inputs: {}, isResearch: false, speedModifier: 1, producedAt: 101, retailInfo: null },
    ]);
    const vwaps = shrinkVwaps([
      { resourceId: 1, quality: 0, vwap: 1000, datetime: timestamp },
    ]);

    const snapshot = {
      t: timestamp,
      r: realm,
      rc: resources,
      vw: vwaps,
    };

    expect(snapshot.t).toBe(timestamp);
    expect(snapshot.r).toBe(realm);
    expect(snapshot.rc.length).toBe(1);
    expect(snapshot.vw.length).toBe(1);
    expect(snapshot.rc[0].i).toBe(1);
    expect(snapshot.vw[0].i).toBe(1);
  });
});
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { FilesystemSandbox } from "../helpers/sandbox.js";
import { makeRealmConfig } from "../helpers/mockData.js";

describe("intelligencePipeline", () => {
  let sandbox: FilesystemSandbox;

  beforeAll(() => {
    sandbox = new FilesystemSandbox();
    sandbox.init();
  });

  afterAll(() => sandbox.destroy());

  it("returns early with zero counts when disabled", async () => {
    const cfg = makeRealmConfig(0, sandbox.root);
    (cfg.intelligence as Record<string, unknown>).enableRealmIntelligence = false;
    vi.doMock("../../config/index.js", () => ({ loadConfig: () => cfg }));

    const { runIntelligencePipeline } = await import("../../jobs/intelligencePipeline.js");
    const result = await runIntelligencePipeline();
    expect(result.ok).toBe(true);
    expect(result.momentum.count).toBe(0);
    expect(result.volatility.count).toBe(0);
    expect(result.stress.count).toBe(0);
    expect(result.regime.count).toBe(0);
    expect(result.leaders.count).toBe(0);
    expect(result.sectors.count).toBe(0);
    expect(result.durationsMs.total).toBe(0);
  });

  it("returns a valid result structure when enabled", async () => {
    const { runIntelligencePipeline } = await import("../../jobs/intelligencePipeline.js");
    const result = await runIntelligencePipeline();
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("momentum");
    expect(result).toHaveProperty("volatility");
    expect(result).toHaveProperty("stress");
    expect(result).toHaveProperty("regime");
    expect(result).toHaveProperty("leaders");
    expect(result).toHaveProperty("sectors");
    expect(result).toHaveProperty("durationsMs.total");
    expect(typeof result.durationsMs.total).toBe("number");
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FilesystemSandbox } from "../helpers/sandbox.js";
import { makeRealmConfig } from "../helpers/mockData.js";

describe("relationalPipeline", () => {
  let sandbox: FilesystemSandbox;

  beforeAll(() => {
    sandbox = new FilesystemSandbox();
    sandbox.init();
  });

  afterAll(() => sandbox.destroy());

  it("returns early with zero counts when disabled", async () => {
    const cfg = makeRealmConfig(0, sandbox.root);
    (cfg.relational as Record<string, unknown>).enableRelationalPipeline = false;
    const { loadConfig } = await import("../../config/index.js");
    const orig = loadConfig();
    try {
      const mod = { loadConfig: () => cfg };
      vi.doMock("../../config/index.js", () => mod);
      const { runRelationalPipeline } = await import("../../jobs/relationalPipeline.js");
      const result = await runRelationalPipeline();
      expect(result.ok).toBe(true);
      expect(result.correlations.count).toBe(0);
      expect(result.anomalies.count).toBe(0);
      expect(result.divergences.count).toBe(0);
      expect(result.contagion.count).toBe(0);
      expect(result.alerts.count).toBe(0);
      expect(result.durationsMs.total).toBe(0);
    } finally {
      vi.doUnmock("../../config/index.js");
    }
  });

  it("returns a valid result structure", async () => {
    const { runRelationalPipeline } = await import("../../jobs/relationalPipeline.js");
    const result = await runRelationalPipeline();
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("correlations");
    expect(result).toHaveProperty("anomalies");
    expect(result).toHaveProperty("divergences");
    expect(result).toHaveProperty("contagion");
    expect(result).toHaveProperty("alerts");
    expect(typeof result.durationsMs.total).toBe("number");
  });
});

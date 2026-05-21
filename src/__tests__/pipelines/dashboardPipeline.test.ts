import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FilesystemSandbox } from "../helpers/sandbox.js";
import { makeRealmConfig } from "../helpers/mockData.js";

describe("dashboardPipeline", () => {
  let sandbox: FilesystemSandbox;

  beforeAll(() => {
    sandbox = new FilesystemSandbox();
    sandbox.init();
  });

  afterAll(() => sandbox.destroy());

  it("returns early with zero counts when disabled", async () => {
    const cfg = makeRealmConfig(0, sandbox.root);
    (cfg.dashboard as Record<string, unknown>).enableDashboardPipeline = false;
    const mod = { loadConfig: () => cfg };
    vi.doMock("../../config/index.js", () => mod);
    const { runDashboardPipeline } = await import("../../jobs/dashboardPipeline.js");
    const result = await runDashboardPipeline();
    expect(result.ok).toBe(true);
    expect(result.summaries.count).toBe(0);
    expect(result.durationsMs.total).toBe(0);
    vi.doUnmock("../../config/index.js");
  });

  it("returns a valid result structure", async () => {
    vi.doUnmock("../../config/index.js");
    const { runDashboardPipeline } = await import("../../jobs/dashboardPipeline.js");
    const result = await runDashboardPipeline();
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("summaries");
    expect(result).toHaveProperty("operational");
    expect(result).toHaveProperty("feed");
    expect(result).toHaveProperty("alerts");
    expect(typeof result.durationsMs.total).toBe("number");
  });
});

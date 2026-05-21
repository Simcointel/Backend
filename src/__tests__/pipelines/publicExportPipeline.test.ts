import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { FilesystemSandbox } from "../helpers/sandbox.js";
import { makeRealmConfig, CATEGORIES } from "../helpers/mockData.js";

let sandbox: FilesystemSandbox;

const mockLoadConfig = vi.fn();
vi.mock("../../config/index.js", () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock("../../jobs/intelligenceUtils.js", () => ({
  getDataRoot: vi.fn(),
}));

vi.mock("../../api/routes/publicData.js", () => ({
  loadLastDashboardSummaries: vi.fn(() => ({})),
  loadLatestMacroData: vi.fn(() => ({ latest: {}, realm: 0 })),
  loadMacroHistory: vi.fn(() => ({ entries: [] })),
  loadMacroIndexes: vi.fn(() => ({ indexes: [] })),
  loadMacroInflation: vi.fn(() => ({ inflation: [] })),
  loadSectorIntelligence: vi.fn(() => ({})),
  loadCorrelations: vi.fn(() => ({})),
  loadAnomalies: vi.fn(() => ({})),
  loadDivergence: vi.fn(() => ({})),
  loadContagion: vi.fn(() => ({})),
}));

describe("publicExportPipeline", () => {
  beforeAll(() => {
    sandbox = new FilesystemSandbox();
    sandbox.init();
  });

  afterAll(() => sandbox.destroy());

  beforeEach(async () => {
    const cfg = makeRealmConfig(0, sandbox.root);
    mockLoadConfig.mockReturnValue(cfg);
    const mockIntelligenceUtils = await import("../../jobs/intelligenceUtils.js");
    (mockIntelligenceUtils.getDataRoot as ReturnType<typeof vi.fn>).mockReturnValue(sandbox.root);
  });

  it("writes export files to the public directory", async () => {
    const { runPublicExportPipeline } = await import("../../jobs/publicExportPipeline.js");
    const result = runPublicExportPipeline();
    expect(result.ok).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
    expect(sandbox.exists("public/manifest.json")).toBe(true);
  });

  it("handles empty realms gracefully", async () => {
    const cfg = makeRealmConfig(0, sandbox.root);
    (cfg.simco as Record<string, unknown>).realms = [];
    mockLoadConfig.mockReturnValue(cfg);
    const { runPublicExportPipeline } = await import("../../jobs/publicExportPipeline.js");
    const result = runPublicExportPipeline();
    expect(result.ok).toBe(true);
  });
});

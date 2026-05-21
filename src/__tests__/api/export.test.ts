import { describe, it, expect } from "vitest";

describe("public export API", () => {
  it("handlePublicExport and handlePublicExportList are exported", async () => {
    const mod = await import("../../api/routes/publicExport.js");
    expect(typeof mod.handlePublicExport).toBe("function");
    expect(typeof mod.handlePublicExportList).toBe("function");
  });

  it("handlePublicExportList returns datasets list", async () => {
    const { handlePublicExportList } = await import("../../api/routes/publicExport.js");
    let data = "";
    const mockRes = {
      writeHead(c: number) { return this; },
      end(d: string) { data = d; },
      setHeader(k: string, v: string) {},
    } as any;
    handlePublicExportList({} as any, mockRes);
    const parsed = JSON.parse(data);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.datasets.length).toBe(15);
    const names = parsed.data.datasets.map((d: { name: string }) => d.name);
    expect(names).toContain("dashboard");
    expect(names).toContain("macro");
    expect(names).toContain("correlations");
    expect(names).toContain("forecasts");
    expect(names).toContain("simulations");
    expect(names).toContain("signals");
    expect(names).toContain("cycles");
    expect(names).toContain("dependencies");
  });
});

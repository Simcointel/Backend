import { IncomingMessage, ServerResponse } from "http";
import { sendSuccess, sendError, sendJson } from "../middleware.js";
import {
  loadLastDashboardSummaries,
  loadLatestMacroData,
  loadMacroHistory,
  loadMacroIndexes,
  loadMacroInflation,
  loadCorrelations,
  loadAnomalies,
  loadDivergence,
  loadContagion,
  loadSectorIntelligence,
  loadForecastData,
  loadSimulationData,
  loadSignalData,
  loadCycleData,
  loadDependencyData,
} from "./publicData.js";
import { getRateLimitStats } from "../rateLimiter.js";

type Dataset =
  | "dashboard" | "macro" | "history" | "indexes" | "inflation"
  | "correlations" | "anomalies" | "divergence" | "contagion" | "sectors"
  | "forecasts" | "simulations" | "signals" | "cycles" | "dependencies";

function toCsv(json: Record<string, unknown> | unknown[]): string {
  const rows = Array.isArray(json) ? json : json ? [json] : [];
  if (rows.length === 0) return "";
  const headers = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === "object") Object.keys(row as Record<string, unknown>).forEach((k) => headers.add(k));
  }
  const cols = Array.from(headers);
  const lines = [cols.map(escapeCsv).join(",")];
  for (const row of rows) {
    if (row && typeof row === "object") {
      lines.push(cols.map((c) => escapeCsv(String((row as Record<string, unknown>)[c] ?? ""))).join(","));
    }
  }
  return lines.join("\n");
}

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function getDataset(name: string, realm: number, limit: number): { data: unknown; format: string } {
  switch (name) {
    case "dashboard": {
      const d = loadLastDashboardSummaries();
      return { data: d, format: "json" };
    }
    case "macro": {
      const d = loadLatestMacroData(realm);
      return { data: d, format: "json" };
    }
    case "history": {
      const d = loadMacroHistory(realm, limit);
      return { data: d.entries, format: "json" };
    }
    case "indexes": {
      const d = loadMacroIndexes(realm, limit);
      return { data: d.indexes, format: "json" };
    }
    case "inflation": {
      const d = loadMacroInflation(realm, limit);
      return { data: d.inflation, format: "json" };
    }
    case "correlations": {
      const d = loadCorrelations();
      return { data: d, format: "json" };
    }
    case "anomalies": {
      const d = loadAnomalies();
      return { data: d, format: "json" };
    }
    case "divergence": {
      const d = loadDivergence();
      return { data: d, format: "json" };
    }
    case "contagion": {
      const d = loadContagion();
      return { data: d, format: "json" };
    }
    case "sectors": {
      const d = loadSectorIntelligence();
      return { data: d, format: "json" };
    }
    case "forecasts": {
      const d = loadForecastData(realm);
      return { data: d, format: "json" };
    }
    case "simulations": {
      const d = loadSimulationData(realm);
      return { data: d, format: "json" };
    }
    case "signals": {
      const d = loadSignalData(realm);
      return { data: d, format: "json" };
    }
    case "cycles": {
      const d = loadCycleData(realm);
      return { data: d, format: "json" };
    }
    case "dependencies": {
      const d = loadDependencyData(realm);
      return { data: d, format: "json" };
    }
    default:
      return { data: null, format: "json" };
  }
}

export function handlePublicExport(req: IncomingMessage, res: ServerResponse, params: Record<string, string>, _body: unknown, query: URLSearchParams): void {
  const dataset = (params.dataset ?? "dashboard") as Dataset;
  const realm = parseInt(query.get("realm") ?? "0");
  const limit = parseInt(query.get("limit") ?? "100");
  const format = query.get("format") ?? "json";

  const result = getDataset(dataset, realm, limit);

  if (!result.data || (Array.isArray(result.data) && result.data.length === 0)) {
    return sendError(res, 404, `No data for dataset: ${dataset}`);
  }

  if (format === "csv") {
    const csv = toCsv(result.data as Record<string, unknown> | unknown[]);
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dataset}-realm${realm}.csv"`,
      "Cache-Control": "public, max-age=300",
    });
    res.end(csv);
    return;
  }

  sendSuccess(res, result.data, {
    dataset,
    realm,
    format: "json",
    rateLimiting: getRateLimitStats(),
  });
}

export function handlePublicExportList(_req: IncomingMessage, res: ServerResponse): void {
  const datasets: { name: string; description: string; url: string }[] = [
    { name: "dashboard", description: "Latest dashboard summaries per realm", url: "/api/public/export/dashboard" },
    { name: "macro", description: "Latest macro snapshot for a realm", url: "/api/public/export/macro?realm=0" },
    { name: "history", description: "Macro history entries", url: "/api/public/export/history?realm=0&limit=120" },
    { name: "indexes", description: "Price indexes (CPI, Core CPI, GDP)", url: "/api/public/export/indexes?realm=0&limit=60" },
    { name: "inflation", description: "Inflation rates", url: "/api/public/export/inflation?realm=0&limit=60" },
    { name: "correlations", description: "Cross-category correlations", url: "/api/public/export/correlations" },
    { name: "anomalies", description: "Market anomaly events", url: "/api/public/export/anomalies" },
    { name: "divergence", description: "Sector divergence signals", url: "/api/public/export/divergence" },
    { name: "contagion", description: "Contagion risk data", url: "/api/public/export/contagion" },
    { name: "sectors", description: "Sector intelligence", url: "/api/public/export/sectors" },
    { name: "forecasts", description: "Latest forecast projections per realm", url: "/api/public/export/forecasts?realm=0" },
    { name: "simulations", description: "Latest simulation scenario results per realm", url: "/api/public/export/simulations?realm=0" },
    { name: "signals", description: "Latest strategic signals per realm", url: "/api/public/export/signals?realm=0" },
    { name: "cycles", description: "Latest market cycle detection per realm", url: "/api/public/export/cycles?realm=0" },
    { name: "dependencies", description: "Latest supply chain dependency analysis per realm", url: "/api/public/export/dependencies?realm=0" },
  ];
  sendSuccess(res, { datasets }, {
    format: "json or csv (add ?format=csv)",
    rateLimiting: getRateLimitStats(),
  });
}

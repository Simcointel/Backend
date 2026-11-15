import { IncomingMessage, ServerResponse } from "http";
import { sendSuccess, sendError, sendJson } from "../middleware.js";
import { getRateLimitStats } from "../rateLimiter.js";
import {
  loadLatestMacroData,
  loadMacroHistory,
  loadMacroIndexes,
  loadMacroInflation,
} from "./publicData.js";
import { computeProfitMargins } from "../../jobs/profitMargins.js";

/**
 * @swagger
 * tags:
 *   name: Public
 *   description: Public API endpoints (rate limited)
 */

type Dataset =
  | "macro" | "history" | "indexes" | "inflation" | "margins";

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
    case "margins": {
      try {
        const d = computeProfitMargins(realm);
        return { data: d, format: "json" };
      } catch {
        return { data: null, format: "json" };
      }
    }
    default:
      return { data: null, format: "json" };
  }
}

/**
 * @swagger
 * /api/public/export/{dataset}:
 *   get:
 *     summary: Export dataset in JSON or CSV format
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: dataset
 *         required: true
 *         schema:
 *           type: string
 *           enum: [macro, history, indexes, inflation, margins]
 *         description: Dataset name
 *       - in: query
 *         name: realm
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Realm number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of entries
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *         description: Output format
 *     responses:
 *       200:
 *         description: Dataset data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExportResponse'
 *           text/csv:
 *             schema:
 *               type: string
 *       404:
 *         description: No data for dataset
 *       500:
 *         description: Failed to load dataset
 */
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
  });
}

/**
 * @swagger
 * /api/public/export:
 *   get:
 *     summary: List available export datasets
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: List of available datasets
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExportListResponse'
 */
export function handlePublicExportList(res: ServerResponse): void {
  const datasets: { name: string; description: string; url: string }[] = [
    { name: "macro", description: "Latest macro snapshot for a realm", url: "/api/public/export/macro?realm=0" },
    { name: "history", description: "Macro history entries", url: "/api/public/export/history?realm=0&limit=120" },
    { name: "indexes", description: "Price indexes (CPI, Core CPI, GDP)", url: "/api/public/export/indexes?realm=0&limit=60" },
    { name: "inflation", description: "Inflation rates", url: "/api/public/export/inflation?realm=0&limit=60" },
    { name: "margins", description: "Profit margins per resource", url: "/api/public/export/margins?realm=0" },
  ];
  sendSuccess(res, { datasets }, {
    format: "json or csv (add ?format=csv)",
  });
}
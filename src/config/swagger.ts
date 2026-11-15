import { loadConfig } from "./index.js";

loadConfig();

export const swaggerOptions = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "SimcoIntel Backend API",
      version: "1.0.0",
      description: "SimcoIntel Backend API for Sim Companies economic intelligence",
      contact: {
        name: "SimcoIntel",
        url: "https://github.com/SimcoIntel",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.HTTP_PORT || 3001}`,
        description: "Development server",
      },
      {
        url: "https://api.simcointel.com",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        ApiEnvelope: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            v: { type: "string" },
            t: { type: "string" },
            data: { type: "object" },
            error: { type: "string" },
          },
        },
        PublicStatus: {
          type: "object",
          properties: {
            api: { type: "string" },
            version: { type: "string" },
            realms: { type: "array", items: { type: "integer" } },
            endpoints: {
              type: "object",
              properties: {
                macro: { type: "string" },
                indexes: { type: "string" },
                inflation: { type: "string" },
                resources: { type: "string" },
                export: { type: "string" },
              },
            },
            generatedAt: { type: "string", format: "date-time" },
          },
        },
        PublicMacro: {
          type: "object",
          properties: {
            realm: { type: "string" },
            latest: {
              type: "object",
              properties: {
                companiesValue: { type: "number", nullable: true },
                activeCompanies: { type: "number", nullable: true },
                bondsSold: { type: "number", nullable: true },
                totalBuildings: { type: "number", nullable: true },
              },
            },
            latestIndexes: {
              type: "object",
              nullable: true,
              properties: {
                cpi: { type: "number", nullable: true },
                coreCpi: { type: "number", nullable: true },
                gdp: { type: "number", nullable: true },
              },
            },
            latestInflation: {
              type: "object",
              nullable: true,
              properties: {
                cpiRate: { type: "number", nullable: true },
                coreCpiRate: { type: "number", nullable: true },
                gdpGrowth: { type: "number", nullable: true },
              },
            },
            generatedAt: { type: "string", format: "date-time" },
          },
        },
        MacroHistoryEntry: {
          type: "object",
          properties: {
            d: { type: "string" },
            ac: { type: "number" },
            cv: { type: "number" },
            tb: { type: "number" },
            bs: { type: "number" },
            ph: { type: "string" },
            cp: { type: "boolean" },
          },
        },
        MacroHistoryResponse: {
          type: "object",
          properties: {
            realm: { type: "integer" },
            totalEntries: { type: "integer" },
            yearsAvailable: { type: "array", items: { type: "integer" } },
            history: { type: "array", items: { $ref: "#/components/schemas/MacroHistoryEntry" } },
          },
        },
        MacroHistoryListResponse: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              years: { type: "array", items: { type: "integer" } },
              totalEntries: { type: "integer" },
            },
          },
        },
        MacroIndexEntry: {
          type: "object",
          properties: {
            ix: {
              type: "object",
              additionalProperties: {
                type: "object",
                properties: {
                  v: { type: "number" },
                },
              },
            },
          },
        },
        MacroIndexesResponse: {
          type: "object",
          properties: {
            realm: { type: "integer" },
            total: { type: "integer" },
            indexes: { type: "array", items: { $ref: "#/components/schemas/MacroIndexEntry" } },
          },
        },
        MacroInflationEntry: {
          type: "object",
          properties: {
            in: {
              type: "object",
              additionalProperties: {
                type: "object",
                properties: {
                  ch: { type: "number" },
                },
              },
            },
          },
        },
        MacroInflationResponse: {
          type: "object",
          properties: {
            realm: { type: "integer" },
            total: { type: "integer" },
            inflation: { type: "array", items: { $ref: "#/components/schemas/MacroInflationEntry" } },
          },
        },
        MacroPhase: {
          type: "object",
          properties: {
            date: { type: "string" },
            phase: { type: "string" },
          },
        },
        MacroTransition: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            date: { type: "string" },
          },
        },
        MacroPhases: {
          type: "object",
          properties: {
            realm: { type: "integer" },
            totalDays: { type: "integer" },
            currentPhase: { type: "string", nullable: true },
            transitions: { type: "array", items: { $ref: "#/components/schemas/MacroTransition" } },
            phases: { type: "array", items: { $ref: "#/components/schemas/MacroPhase" } },
          },
        },
        MacroLatestResponse: {
          type: "object",
          properties: {
            realm: { type: "integer" },
            latestHistory: { type: "object", nullable: true },
            latestIndexes: { type: "object", nullable: true },
            latestInflation: { type: "object", nullable: true },
          },
        },
        ProfitMarginResource: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            category: { type: "string" },
            categoryName: { type: "string" },
            producedPerHour: { type: "number" },
            revenuePerHour: { type: "number" },
            inputCostPerHour: { type: "number" },
            wagesPerHour: { type: "number" },
            transportPerHour: { type: "number" },
            netProfitPerHour: { type: "number" },
            marginPct: { type: "number" },
            marginDelta: { type: "number", nullable: true },
            profitDelta: { type: "number", nullable: true },
            marginDirection: { type: "string", nullable: true },
            forecastMargin: { type: "number", nullable: true },
            trendDirection: { type: "string", nullable: true },
            outputVwap: { type: "number" },
          },
        },
        ProfitMarginsResponse: {
          type: "object",
          properties: {
            ts: { type: "string" },
            realm: { type: "integer" },
            resources: { type: "array", items: { $ref: "#/components/schemas/ProfitMarginResource" } },
            total: { type: "integer" },
          },
        },
        Alert: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: { type: "string", enum: ["info", "warning", "success", "error"] },
            title: { type: "string" },
            message: { type: "string" },
            timestamp: { type: "string", format: "date-time" },
            realm: { type: "integer" },
          },
        },
        AlertsResponse: {
          type: "object",
          properties: {
            alerts: { type: "array", items: { $ref: "#/components/schemas/Alert" } },
            generatedAt: { type: "string", format: "date-time" },
          },
        },
        ExportDataset: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            url: { type: "string" },
          },
        },
        ExportListResponse: {
          type: "object",
          properties: {
            datasets: { type: "array", items: { $ref: "#/components/schemas/ExportDataset" } },
          },
        },
        ExportResponse: {
          type: "object",
          properties: {
            dataset: { type: "string" },
            realm: { type: "integer" },
            format: { type: "string" },
          },
        },
        HealthResponse: {
          type: "object",
          properties: {
            status: { type: "string" },
            checks: { type: "object" },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        StatusResponse: {
          type: "object",
          properties: {
            health: { $ref: "#/components/schemas/HealthResponse" },
            failures: { type: "object" },
            scheduler: {
              type: "object",
              properties: {
                running: { type: "boolean" },
                uptimeMs: { type: "integer" },
              },
            },
            realms: { type: "array", items: { type: "integer" } },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        SyncFile: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
        },
        SyncResponse: {
          type: "object",
          properties: {
            files: { type: "array", items: { $ref: "#/components/schemas/SyncFile" } },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Health", description: "Health check endpoints" },
      { name: "Public", description: "Public API endpoints (rate limited)" },
      { name: "Macro", description: "Macro economic data endpoints" },
      { name: "Admin", description: "Admin panel endpoints (requires auth)" },
      { name: "Cron", description: "Cron job endpoints" },
      { name: "Snapshots", description: "Snapshot management" },
      { name: "Archives", description: "Archive management" },
      { name: "Config", description: "Configuration management" },
      { name: "Actions", description: "Admin actions" },
      { name: "Sync", description: "Sim Companies sync" },
      { name: "Cron", description: "Cron job triggers" },
    ],
  },
  apis: ["./src/api/routes/*.ts", "./src/index.ts"],
};

export const swaggerUiOptions = {
  customCss: ".swagger-ui .topbar { display: none }",
  customSiteTitle: "SimcoIntel API Documentation",
};

export async function generateSwaggerSpec() {
  const swaggerJsdoc = await import("swagger-jsdoc");
  return swaggerJsdoc.default(swaggerOptions);
}
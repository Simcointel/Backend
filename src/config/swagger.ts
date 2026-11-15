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
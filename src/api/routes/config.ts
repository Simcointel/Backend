import { IncomingMessage, ServerResponse } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { sendSuccess, sendError, parseJsonBody } from "../middleware.js";
import { loadConfig, reloadConfig } from "../../config/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CONFIG_SECTIONS = ["formulas", "schedules", "featureFlags", "forecastSettings", "simulationSettings", "cycleSettings", "dependencyWeights"];

export async function handleListConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const cfg = loadConfig();
  const sections: Record<string, unknown> = {};
  for (const section of CONFIG_SECTIONS) {
    sections[section] = (cfg as unknown as Record<string, unknown>)[section];
  }
  sendSuccess(res, { sections: CONFIG_SECTIONS, values: sections });
}

export async function handleGetConfig(req: IncomingMessage, res: ServerResponse, section: string): Promise<void> {
  const cfg = loadConfig();
  const value = (cfg as unknown as Record<string, unknown>)[section];
  if (value === undefined) {
    return sendError(res, 404, `Config section '${section}' not found`);
  }
  sendSuccess(res, value);
}

export async function handleUpdateConfig(req: IncomingMessage, res: ServerResponse, section: string): Promise<void> {
  if (!CONFIG_SECTIONS.includes(section)) {
    return sendError(res, 404, `Config section '${section}' not found`);
  }

  let body: unknown;
  try {
    body = await parseJsonBody(req);
  } catch {
    return sendError(res, 400, "Invalid JSON body");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendError(res, 400, "Body must be a JSON object");
  }

  const configPaths = [resolve(process.cwd(), "config"), resolve(__dirname, "..", "..", "config")];
  const configDir = configPaths.find((p) => existsSync(resolve(p, `${section}.json`))) || configPaths[0];
  const filePath = resolve(configDir, `${section}.json`);

  const current = existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf-8")) : {};
  const merged = { ...current, ...(body as Record<string, unknown>) };
  writeFileSync(filePath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  reloadConfig();

  sendSuccess(res, { section, updated: Object.keys(body as Record<string, unknown>) });
}

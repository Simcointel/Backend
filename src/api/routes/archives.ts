import { getResolvedDataPath } from "../../storage/repoSync.js";
import { IncomingMessage, ServerResponse } from "http";
import { readdirSync, existsSync, statSync } from "fs";
import { resolve } from "path";
import { sendSuccess, sendError } from "../middleware.js";
import { loadConfig } from "../../config/index.js";

export async function handleListArchives(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const cfg = loadConfig();
  const dataPath = resolve(getResolvedDataPath());
  const result: Record<string, { count: number; archives: string[] }> = {};

  for (const realm of cfg.simco.realms) {
    const dir = resolve(dataPath, "archives", "market", `realm-${realm}`);
    if (!existsSync(dir)) {
      result[`realm-${realm}`] = { count: 0, archives: [] };
      continue;
    }
    const archives = readdirSync(dir)
      .filter((f) => f.startsWith("market-archive-") && f.endsWith(".json"))
      .sort()
      .reverse();
    result[`realm-${realm}`] = {
      count: archives.length,
      archives,
    };
  }

  sendSuccess(res, result);
}

export async function handleListRealmArchives(req: IncomingMessage, res: ServerResponse, realm: string): Promise<void> {
  const cfg = loadConfig();
  const dataPath = resolve(getResolvedDataPath());
  const dir = resolve(dataPath, "archives", "market", `realm-${realm}`);

  if (!existsSync(dir)) {
    return sendSuccess(res, { realm, archives: [] });
  }

  const archives = readdirSync(dir)
    .filter((f) => f.startsWith("market-archive-") && f.endsWith(".json"))
    .sort()
    .reverse()
    .map((f) => {
      const fullPath = resolve(dir, f);
      try {
        const stats = statSync(fullPath);
        return { name: f, size: stats.size, mtime: stats.mtime.toISOString() };
      } catch {
        return { name: f, size: 0, mtime: null };
      }
    });

  sendSuccess(res, { realm, archives });
}

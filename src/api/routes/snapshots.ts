import { IncomingMessage, ServerResponse } from "http";
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { resolve, join } from "path";
import { sendSuccess, sendError } from "../middleware.js";
import { loadConfig } from "../../config/index.js";

export async function handleListSnapshots(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const cfg = loadConfig();
  const dataPath = resolve(cfg.dataRepo.path);
  const result: Record<string, { count: number; latest: string | null }> = {};

  for (const realm of cfg.simco.realms) {
    const dir = resolve(dataPath, "snapshots", "market", `realm-${realm}`);
    if (!existsSync(dir)) {
      result[`realm-${realm}`] = { count: 0, latest: null };
      continue;
    }
    const files = readdirSync(dir)
      .filter((f) => f.startsWith("market-snapshot-") && f.endsWith(".json"))
      .sort()
      .reverse();
    result[`realm-${realm}`] = {
      count: files.length,
      latest: files.length > 0 ? files[0] : null,
    };
  }

  sendSuccess(res, result);
}

export async function handleListRealmSnapshots(req: IncomingMessage, res: ServerResponse, realm: string): Promise<void> {
  const cfg = loadConfig();
  const dataPath = resolve(cfg.dataRepo.path);
  const dir = resolve(dataPath, "snapshots", "market", `realm-${realm}`);

  if (!existsSync(dir)) {
    return sendSuccess(res, { realm, files: [] });
  }

  const files = readdirSync(dir)
    .filter((f) => f.startsWith("market-snapshot-") && f.endsWith(".json"))
    .sort()
    .reverse()
    .map((f) => {
      const fullPath = join(dir, f);
      try {
        const stats = statSync(fullPath);
        return { name: f, size: stats.size, mtime: stats.mtime.toISOString() };
      } catch {
        return { name: f, size: 0, mtime: null };
      }
    });

  sendSuccess(res, { realm, files });
}

export async function handleGetSnapshot(req: IncomingMessage, res: ServerResponse, realm: string, file: string): Promise<void> {
  const cfg = loadConfig();
  const dataPath = resolve(cfg.dataRepo.path);
  const filePath = resolve(dataPath, "snapshots", "market", `realm-${realm}`, file);

  if (!filePath.startsWith(resolve(dataPath))) {
    return sendError(res, 403, "Path traversal denied");
  }

  if (!existsSync(filePath)) {
    return sendError(res, 404, "Snapshot not found");
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);
    sendSuccess(res, data);
  } catch {
    sendError(res, 500, "Failed to read snapshot");
  }
}

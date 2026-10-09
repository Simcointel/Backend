import { IncomingMessage, ServerResponse } from "http";
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { resolve, join } from "path";
import { sendSuccess, sendError } from "../middleware.js";
import { loadConfig } from "../../config/index.js";

const VALID_SNAPSHOT_TYPES = new Set([
  "market",
  "market-summary",
  "profit-margins",
  "macro-history",
  "government-orders",
]);

function isValidSnapshotType(type: string): boolean {
  return VALID_SNAPSHOT_TYPES.has(type);
}

function getSnapshotDir(dataPath: string, realm: string, type: string): string {
  return resolve(dataPath, "snapshots", type, `realm-${realm}`);
}

export async function handleListSnapshots(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const cfg = loadConfig();
  const dataPath = resolve(cfg.dataRepo.path);
  const result: Record<string, { count: number; latest: string | null }> = {};

  for (const realm of cfg.simco.realms) {
    const dir = getSnapshotDir(dataPath, String(realm), "market");
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
  
  // Get type from query params (default: market)
  const url = new URL(req.url || "/", "http://localhost");
  const type = url.searchParams.get("type") || "market";

  if (!isValidSnapshotType(type)) {
    return sendError(res, 400, `Invalid snapshot type: ${type}`);
  }

  const dir = getSnapshotDir(dataPath, realm, type);

  if (!existsSync(dir)) {
    return sendSuccess(res, { realm, files: [], type });
  }

  const prefix = type === "government-orders" ? "government-orders-" : "market-snapshot-";
  
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
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

  sendSuccess(res, { realm, type, files });
}

export async function handleGetSnapshot(req: IncomingMessage, res: ServerResponse, realm: string, file: string): Promise<void> {
  const cfg = loadConfig();
  const dataPath = resolve(cfg.dataRepo.path);
  
  // Get type from query params (default: market)
  const url = new URL(req.url || "/", "http://localhost");
  const type = url.searchParams.get("type") || "market";

  if (!isValidSnapshotType(type)) {
    return sendError(res, 400, `Invalid snapshot type: ${type}`);
  }

  const filePath = resolve(dataPath, "snapshots", type, `realm-${realm}`, file);

  if (!filePath.startsWith(resolve(dataPath, "snapshots", type))) {
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

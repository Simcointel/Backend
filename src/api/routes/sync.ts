import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { resolve, join, relative } from "path";
import { IncomingMessage, ServerResponse } from "http";
import { loadConfig } from "../../config/index.js";
import { sendSuccess, sendError } from "../middleware.js";
import { logger } from "../../logging/logger.js";

export function handleSync(req: IncomingMessage, res: ServerResponse): void {
  const secret = process.env.SYNC_SECRET;
  if (secret) {
    const auth = req.headers["authorization"] ?? "";
    if (!auth.startsWith("Bearer ") || auth.slice(7) !== secret) {
      sendError(res, 401, "Invalid or missing sync secret");
      return;
    }
  }

  const cfg = loadConfig();
  const repoRoot = resolve(cfg.dataRepo.path);
  if (!existsSync(repoRoot)) {
    sendError(res, 404, "Data repo directory not found");
    return;
  }

  const files: Array<{ path: string; content: string }> = [];

  function walkDir(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const fullPath = join(dir, name);
      const relPath = relative(repoRoot, fullPath).replace(/\\/g, "/");
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else if (stat.isFile()) {
          const content = readFileSync(fullPath, "utf-8");
          files.push({ path: relPath, content });
        }
      } catch {
        // skip unreadable
      }
    }
  }

  walkDir(repoRoot);

  sendSuccess(res, { files });
  logger.info(`Sync: ${files.length} files served`);
}

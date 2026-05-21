import { execSync } from "child_process";
import { existsSync, rmSync } from "fs";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";

const CLONE_PATH = "/tmp/simco-data";

export async function ensureDataRepo(): Promise<string> {
  const cfg = loadConfig();
  const repoPath = cfg.dataRepo.path;

  // If it's not a URL, assume it's a local path and skip cloning
  if (!repoPath.startsWith("http")) {
    return repoPath;
  }

  logger.info(`Cloning data repository from ${repoPath} to ${CLONE_PATH}`);

  if (existsSync(CLONE_PATH)) {
    try {
      // For Vercel serverless, we might want to refresh if possible,
      // but /tmp can persist between some executions.
      // For simplicity, we just use existing one or re-clone if needed.
      // Here we choose to use existing to save time in serverless.
      return CLONE_PATH;
    } catch (err) {
      rmSync(CLONE_PATH, { recursive: true, force: true });
    }
  }

  let authUrl = repoPath;
  if (cfg.dataRepo.githubToken) {
    authUrl = repoPath.replace("https://", `https://x-access-token:${cfg.dataRepo.githubToken}@`);
  }

  try {
    execSync(`git clone --depth 1 ${authUrl} ${CLONE_PATH}`, { stdio: "pipe" });
    logger.info("Data repository cloned successfully");
    return CLONE_PATH;
  } catch (err) {
    logger.error("Failed to clone data repository", err);
    throw err;
  }
}

export function getResolvedDataPath(): string {
  const cfg = loadConfig();
  if (cfg.dataRepo.path.startsWith("http")) {
    return CLONE_PATH;
  }
  return cfg.dataRepo.path;
}

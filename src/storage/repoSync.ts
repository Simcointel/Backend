import { existsSync, rmSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { join, resolve, dirname } from "path";
import AdmZip from "adm-zip";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";

const CLONE_PATH = "/tmp/simco-data";

export async function ensureDataRepo(): Promise<string> {
  const cfg = loadConfig();
  const repoPath = cfg.dataRepo.path;

  // If it's not a URL, assume it's a local path and skip sync
  if (!repoPath.startsWith("http")) {
    return repoPath;
  }

  // Check if we already have data
  if (existsSync(CLONE_PATH)) {
    const files = readdirSync(CLONE_PATH);
    if (files.length > 0) {
      return CLONE_PATH;
    }
  }

  logger.info(`Downloading data repository from GitHub as ZIP`);

  const { owner, repo, branch, githubToken } = cfg.dataRepo;

  // Use SimcoIntel/Data as fallback if not provided but URL is given
  const targetOwner = owner || "SimcoIntel";
  const targetRepo = repo || "Data";
  const targetBranch = branch || "main";

  const url = `https://api.github.com/repos/${targetOwner}/${targetRepo}/zipball/${targetBranch}`;

  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "SimcoIntel-Backend"
  };

  if (githubToken) {
    headers["Authorization"] = `Bearer ${githubToken}`;
  }

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to download repo: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const zip = new AdmZip(buffer);

    if (!existsSync(CLONE_PATH)) {
      mkdirSync(CLONE_PATH, { recursive: true });
    }

    const entries = zip.getEntries();

    logger.info(`Extracting ${entries.length} entries to ${CLONE_PATH}`);

    for (const entry of entries) {
      const entryName = entry.entryName;
      const parts = entryName.split("/");

      // GitHub zipballs have a top-level directory like "owner-repo-hash/"
      // We want to strip that and put everything in CLONE_PATH
      if (parts.length <= 1) continue;

      const relativePath = parts.slice(1).join("/");
      if (!relativePath) continue;

      const targetPath = join(CLONE_PATH, relativePath);

      if (entry.isDirectory) {
        if (!existsSync(targetPath)) {
          mkdirSync(targetPath, { recursive: true });
        }
      } else {
        const dir = dirname(targetPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(targetPath, entry.getData());
      }
    }

    logger.info("Data repository synchronized successfully via ZIP");
    return CLONE_PATH;
  } catch (err) {
    logger.error("Failed to synchronize data repository", err);
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

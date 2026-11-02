import { readdir, readFile } from "fs/promises";
import { join, resolve, relative } from "path";
import { logger } from "../logging/logger.js";
import { StorageError } from "../errors/errors.js";
import { getGithubToken } from "../api/connectAuth.js";

export interface SnapshotPayload {
  timestamp: string;
  snapshotType: string;
  data: unknown;
}

export interface DataRepoConfig {
  path: string;
  githubToken: string;
  owner: string;
  repo: string;
  branch: string;
}

export interface IDataRepoWriter {
  writeSnapshot(snapshot: SnapshotPayload, subDir: string): Promise<string>;
  commitAndPush(message: string): Promise<void>;
}

export async function githubFetch(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000); // 30s timeout for slow GitHub API
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class DataRepoWriter implements IDataRepoWriter {
  private config: DataRepoConfig;

  constructor(config: DataRepoConfig) {
    this.config = config;
  }

  private getApiBase(): string {
    return `https://api.github.com/repos/${this.config.owner}/${this.config.repo}`;
  }

  private getHeaders(): Record<string, string> {
    const token = this.config.githubToken;
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "SimcoIntel-Backend",
      Accept: "application/vnd.github.v3+json",
    };
  }

  async writeSnapshot(snapshot: SnapshotPayload, subDir: string): Promise<string> {
    const filename = `${snapshot.snapshotType}-${snapshot.timestamp}.json`;
    // Write full snapshot object (timestamp, snapshotType, data) for Web frontend compatibility
    const content = JSON.stringify(snapshot, null, 2);
    const path = `${subDir}/${filename}`.replace(/\\/g, "/");
    const contentSize = Buffer.byteLength(content, "utf-8");

    logger.info(`[DataRepoWriter] Writing snapshot: ${path} (${contentSize} bytes)`);
    const startTime = Date.now();

    await this.writeFileViaContentsApi(path, content, `Add ${snapshot.snapshotType} snapshot: ${snapshot.timestamp}`);

    await this.updateIndex(subDir, filename);

    const duration = Date.now() - startTime;
    logger.info(`[DataRepoWriter] Snapshot written via Contents API in ${duration}ms: ${path} (${contentSize} bytes)`);
    return path;
  }

  private async writeFileViaContentsApi(path: string, content: string, message: string): Promise<void> {
    const api = this.getApiBase();
    const headers = this.getHeaders();
    const branch = this.config.branch;

    const sha = await this.getFileSha(api, headers, branch, path);
    logger.debug(`[DataRepoWriter] Writing file: ${path} (${content.length} chars, sha: ${sha || "new"})`);

    const body: Record<string, unknown> = {
      message,
      content: Buffer.from(content, "utf-8").toString("base64"),
      branch,
    };
    if (sha) body.sha = sha;

    const res = await githubFetch(`${api}/contents/${encodeURIComponent(path)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error(`[DataRepoWriter] Contents API write failed for ${path}: ${res.status} ${text}`);
      throw new StorageError(`Contents API write failed for ${path}: ${res.status} ${text}`);
    }

    logger.debug(`[DataRepoWriter] File written successfully: ${path}`);
  }

  private async updateIndex(subDir: string, newFilename: string): Promise<void> {
    const indexPath = `${subDir}/index.json`.replace(/\\/g, "/");
    let index = { latest: "", files: [] as string[] };

    let sha: string | null = null;
    try {
      sha = await this.getFileSha(this.getApiBase(), this.getHeaders(), this.config.branch, indexPath);
    } catch {
      sha = null;
    }

    if (sha) {
      try {
        const api = this.getApiBase();
        const headers = this.getHeaders();
        const res = await githubFetch(`${this.getApiBase()}/contents/${encodeURIComponent(indexPath)}?ref=${this.config.branch}`, { headers: this.getHeaders() });
        if (res.ok) {
          const data = await res.json() as { content: string; sha: string };
          const content = Buffer.from(data.content, "base64").toString("utf-8");
          index = JSON.parse(content);
          logger.debug(`[DataRepoWriter] Loaded existing index: ${indexPath} (${index.files.length} files)`);
        }
      } catch {
        logger.debug(`[DataRepoWriter] Failed to load index: ${indexPath}`);
      }
    }

    index.latest = newFilename;
    if (!index.files.includes(newFilename)) {
      index.files.unshift(newFilename);
      index.files = index.files.slice(0, 100);
    }

    await this.writeFileViaContentsApi(`${subDir}/index.json`, JSON.stringify(index, null, 2), `Update index: add ${newFilename}`);
    logger.debug(`[DataRepoWriter] Index updated: ${indexPath} (latest: ${newFilename}, ${index.files.length} files)`);
  }

  async commitAndPush(message: string): Promise<void> {
    logger.info("commitAndPush called (no-op with Contents API): " + message);
  }

  private async getFileSha(api: string, headers: Record<string, string>, branch: string, path: string): Promise<string | null> {
    try {
      const res = await githubFetch(`${api}/contents/${encodeURIComponent(path)}?ref=${branch}`, { headers });
      if (res.ok) {
        const data = (await res.json()) as { sha: string };
        return data.sha;
      }
      return null;
    } catch {
      return null;
    }
  }
}

let dataRepoWriterInstance: DataRepoWriter | null = null;

export function getDataRepoWriter(config?: DataRepoConfig): DataRepoWriter {
  if (!dataRepoWriterInstance && config) {
    dataRepoWriterInstance = new DataRepoWriter(config);
  }
  if (!dataRepoWriterInstance) {
    throw new Error("DataRepoWriter not initialized — call with config first");
  }
  return dataRepoWriterInstance;
}

export function resetDataRepoWriter(): void {
  dataRepoWriterInstance = null;
}
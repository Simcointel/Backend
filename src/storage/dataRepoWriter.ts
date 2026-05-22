import { writeFileSync, existsSync, mkdirSync } from "fs";
import { readdir, readFile } from "fs/promises";
import { join, resolve, relative } from "path";
import { logger } from "../logging/logger.js";
import { StorageError } from "../errors/errors.js";

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

async function githubFetch(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      clearTimeout((options.signal as any)?.timeout);
      if (i === retries - 1) throw err;
      const delay = 1000 * (i + 1);
      logger.warn(`GitHub API retry ${i + 1}/${retries} after ${delay}ms: ${url}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

export class DataRepoWriter implements IDataRepoWriter {
  private config: DataRepoConfig;

  constructor(config: DataRepoConfig) {
    this.config = config;
  }

  async writeSnapshot(snapshot: SnapshotPayload, subDir: string): Promise<string> {
    const repoRoot = resolve(this.config.path);

    if (!existsSync(repoRoot)) {
      throw new StorageError(`Data repo path does not exist: ${repoRoot}`);
    }

    const dir = join(repoRoot, subDir);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const filename = `${snapshot.snapshotType}-${snapshot.timestamp}.json`;
    const filePath = join(dir, filename);

    const content = JSON.stringify(snapshot.data, null, 2);
    writeFileSync(filePath, content, "utf-8");

    logger.info("Snapshot written", filePath);
    return filePath;
  }

  async commitAndPush(message: string): Promise<void> {
    const { owner, repo, branch, githubToken, path: repoPath } = this.config;
    if (!githubToken) {
      logger.error("GITHUB_TOKEN not set -- cannot push to data repo");
      return;
    }

    if (!owner || !repo) {
      logger.error(`Invalid data repo config: owner="${owner}" repo="${repo}"`);
      return;
    }

    const repoRoot = resolve(repoPath);
    if (!existsSync(repoRoot)) {
      logger.error(`Data repo directory missing at ${repoRoot} -- nothing to push`);
      return;
    }

    const api = `https://api.github.com/repos/${owner}/${repo}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${githubToken}`,
      "Content-Type": "application/json",
      "User-Agent": "SimcoIntel-Backend",
    };

    const files: Array<{ path: string; content: string }> = [];

    async function walkDir(dir: string): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relativePath = relative(repoRoot, fullPath).replace(/\\/g, "/");
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.isFile()) {
          const content = await readFile(fullPath, "utf-8");
          files.push({ path: relativePath, content });
        }
      }
    }

    await walkDir(repoRoot);
    logger.info(`Pushing ${files.length} file(s) to ${owner}/${repo} (branch: ${branch})`);

    if (files.length === 0) {
      logger.info("No files to push");
      return;
    }

    // Try Git Data API first (single commit)
    try {
      await this.pushViaGitApi(api, headers, branch, message, files);
      logger.info(`Pushed ${files.length} file(s) to ${owner}/${repo}`);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`Git Data API push failed, falling back to Contents API: ${msg}`);
    }

    // Fallback: Contents API (one commit per file)
    try {
      await this.pushViaContentsApi(api, headers, branch, message, files);
      logger.info(`Pushed ${files.length} file(s) to ${owner}/${repo} via Contents API`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new StorageError(`All push methods failed: ${msg}`);
    }
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

  private async pushViaGitApi(
    api: string,
    headers: Record<string, string>,
    branch: string,
    message: string,
    files: Array<{ path: string; content: string }>,
  ): Promise<void> {
    // 1. Get current commit SHA
    const refRes = await githubFetch(`${api}/git/refs/heads/${branch}`, { headers });
    if (!refRes.ok) {
      throw new StorageError(`Ref fetch: ${refRes.status} ${await refRes.text()}`);
    }
    const ref = (await refRes.json()) as { object: { sha: string } };
    const currentCommitSha = ref.object.sha;

    // 2. Get current tree
    const commitRes = await githubFetch(`${api}/git/commits/${currentCommitSha}`, { headers });
    if (!commitRes.ok) {
      throw new StorageError(`Commit fetch: ${commitRes.status} ${await commitRes.text()}`);
    }
    const commit = (await commitRes.json()) as { tree: { sha: string } };
    const baseTreeSha = commit.tree.sha;

    // 3. Create blobs
    const entries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
    for (const file of files) {
      const blobRes = await githubFetch(`${api}/git/blobs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
      });
      if (!blobRes.ok) {
        throw new StorageError(`Blob ${file.path}: ${blobRes.status} ${await blobRes.text()}`);
      }
      const blob = (await blobRes.json()) as { sha: string };
      entries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    // 4. Create tree
    const treeRes = await githubFetch(`${api}/git/trees`, {
      method: "POST",
      headers,
      body: JSON.stringify({ base_tree: baseTreeSha, tree: entries }),
    });
    if (!treeRes.ok) {
      throw new StorageError(`Tree create: ${treeRes.status} ${await treeRes.text()}`);
    }
    const tree = (await treeRes.json()) as { sha: string };

    // 5. Create commit
    const commitRes2 = await githubFetch(`${api}/git/commits`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, tree: tree.sha, parents: [currentCommitSha] }),
    });
    if (!commitRes2.ok) {
      throw new StorageError(`Commit create: ${commitRes2.status} ${await commitRes2.text()}`);
    }
    const newCommit = (await commitRes2.json()) as { sha: string };

    // 6. Update ref
    const refRes2 = await githubFetch(`${api}/git/refs/heads/${branch}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    });
    if (!refRes2.ok) {
      throw new StorageError(`Ref update: ${refRes2.status} ${await refRes2.text()}`);
    }
  }

  private async pushViaContentsApi(
    api: string,
    headers: Record<string, string>,
    branch: string,
    message: string,
    files: Array<{ path: string; content: string }>,
  ): Promise<void> {
    for (const file of files) {
      const sha = await this.getFileSha(api, headers, branch, file.path);
      const body: Record<string, unknown> = {
        message,
        content: Buffer.from(file.content, "utf-8").toString("base64"),
        branch,
      };
      if (sha) body.sha = sha;

      const res = await githubFetch(`${api}/contents/${encodeURIComponent(file.path)}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        logger.warn(`Contents API failed for ${file.path}: ${res.status} ${text}`);
      }
    }
  }
}

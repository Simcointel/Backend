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
      logger.warn("GITHUB_TOKEN not set -- skipping push");
      return;
    }

    const api = `https://api.github.com/repos/${owner}/${repo}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${githubToken}`,
      "Content-Type": "application/json",
      "User-Agent": "SimcoIntel-Backend",
    };

    const repoRoot = resolve(repoPath);
    if (!existsSync(repoRoot)) {
      logger.warn("Data repo directory missing, nothing to push");
      return;
    }

    // 1. Get current commit SHA for the branch
    const refRes = await fetch(`${api}/git/refs/heads/${branch}`, { headers });
    if (!refRes.ok) {
      throw new StorageError(`Failed to get branch ref: ${refRes.status} ${await refRes.text()}`);
    }
    const ref = (await refRes.json()) as { object: { sha: string } };
    const currentCommitSha = ref.object.sha;

    // 2. Get the current tree SHA
    const commitRes = await fetch(`${api}/git/commits/${currentCommitSha}`, { headers });
    if (!commitRes.ok) {
      throw new StorageError(`Failed to get commit: ${commitRes.status} ${await commitRes.text()}`);
    }
    const commit = (await commitRes.json()) as { tree: { sha: string } };
    const baseTreeSha = commit.tree.sha;

    // 3. Walk local files and create blobs via API
    const entries: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];

    async function walkDir(dir: string): Promise<void> {
      const files = await readdir(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = join(dir, file.name);
        const relativePath = relative(repoRoot, fullPath).replace(/\\/g, "/");
        if (file.isDirectory()) {
          await walkDir(fullPath);
        } else if (file.isFile()) {
          const content = await readFile(fullPath, "utf-8");
          const blobRes = await fetch(`${api}/git/blobs`, {
            method: "POST",
            headers,
            body: JSON.stringify({ content, encoding: "utf-8" }),
          });
          if (!blobRes.ok) {
            throw new StorageError(`Failed to create blob for ${relativePath}: ${blobRes.status} ${await blobRes.text()}`);
          }
          const blob = (await blobRes.json()) as { sha: string };
          entries.push({ path: relativePath, mode: "100644", type: "blob", sha: blob.sha });
        }
      }
    }

    await walkDir(repoRoot);

    if (entries.length === 0) {
      logger.info("No files to push");
      return;
    }

    // 4. Create tree with base_tree to preserve existing files
    const treeRes = await fetch(`${api}/git/trees`, {
      method: "POST",
      headers,
      body: JSON.stringify({ base_tree: baseTreeSha, tree: entries }),
    });
    if (!treeRes.ok) {
      throw new StorageError(`Failed to create tree: ${treeRes.status} ${await treeRes.text()}`);
    }
    const tree = (await treeRes.json()) as { sha: string };

    // 5. Create commit
    const commitBody = { message, tree: tree.sha, parents: [currentCommitSha] };
    const commitRes2 = await fetch(`${api}/git/commits`, {
      method: "POST",
      headers,
      body: JSON.stringify(commitBody),
    });
    if (!commitRes2.ok) {
      throw new StorageError(`Failed to create commit: ${commitRes2.status} ${await commitRes2.text()}`);
    }
    const newCommit = (await commitRes2.json()) as { sha: string };

    // 6. Update branch ref
    const refUpdateRes = await fetch(`${api}/git/refs/heads/${branch}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    });
    if (!refUpdateRes.ok) {
      throw new StorageError(`Failed to update ref: ${refUpdateRes.status} ${await refUpdateRes.text()}`);
    }

    logger.info(`Pushed ${entries.length} file(s) to ${owner}/${repo} (commit: ${newCommit.sha})`);
  }
}

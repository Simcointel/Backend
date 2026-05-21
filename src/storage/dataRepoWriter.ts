import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";
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
    if (!this.config.githubToken) {
      logger.warn("GITHUB_TOKEN not set – skipping git push");
      return;
    }

    const repoRoot = resolve(this.config.path);

    const { execSync } = await import("child_process");

    const execOpts = { cwd: repoRoot, stdio: "pipe" as const };

    try {
      execSync("git add -A", execOpts);
      execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, execOpts);
      execSync(`git push origin ${this.config.branch}`, {
        ...execOpts,
        env: { ...process.env, GIT_ASKPASS: "echo" },
      });
      logger.info("Pushed to data repo");
    } catch (err) {
      throw new StorageError("Failed to commit/push to data repo", err);
    }
  }
}

import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

export class FilesystemSandbox {
  readonly root: string;
  private _cleanup = false;

  constructor() {
    this.root = resolve(tmpdir(), `simco-test-${randomUUID()}`);
  }

  init(): void {
    mkdirSync(this.root, { recursive: true });
    this._cleanup = true;
  }

  write(relativePath: string, content: string): string {
    const full = resolve(this.root, relativePath);
    mkdirSync(resolve(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf-8");
    return full;
  }

  writeJson(relativePath: string, data: unknown): string {
    return this.write(relativePath, JSON.stringify(data));
  }

  read(relativePath: string): string {
    return readFileSync(resolve(this.root, relativePath), "utf-8");
  }

  readJson<T = unknown>(relativePath: string): T {
    return JSON.parse(this.read(relativePath)) as T;
  }

  exists(relativePath: string): boolean {
    return existsSync(resolve(this.root, relativePath));
  }

  list(dir: string): string[] {
    const full = resolve(this.root, dir);
    if (!existsSync(full)) return [];
    return readdirSync(full);
  }

  path(relativePath: string): string {
    return resolve(this.root, relativePath);
  }

  destroy(): void {
    if (this._cleanup && existsSync(this.root)) {
      rmSync(this.root, { recursive: true, force: true });
    }
  }
}

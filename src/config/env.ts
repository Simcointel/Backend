import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadEnv(): void {
  const envPath = resolve(__dirname, "..", "..", ".env");
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}

export function envString(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

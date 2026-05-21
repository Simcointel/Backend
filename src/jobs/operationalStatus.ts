import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { loadConfig } from "../config/index.js";
import { getDataRoot } from "./intelligenceUtils.js";
import { getConsecutiveFailures, getLastFailureTime } from "./failureTracker.js";
import { isSchedulerRunning, getSchedulerUptime } from "./scheduler.js";

export interface PipelineRun {
  name: string;
  lastRun: string | null;
  lastOk: boolean;
  totalRuns: number;
  failedRuns: number;
  avgDurationMs: number;
}

export interface OperationalStatus {
  t: string;
  scheduler: {
    running: boolean;
    uptimeMs: number;
    uptimeFormatted: string;
  };
  pipelines: PipelineRun[];
  fetch: {
    consecutiveFailures: number;
    lastFailure: string | null;
  };
}

function statePath(): string {
  return resolve(getDataRoot(), "state", "operational", "status.json");
}

export function loadOperationalState(): { pipelines: PipelineRun[] } {
  const p = statePath();
  if (!existsSync(p)) return { pipelines: [] };
  try { return JSON.parse(readFileSync(p, "utf-8")) as { pipelines: PipelineRun[] }; }
  catch { return { pipelines: [] }; }
}

export function saveOperationalState(state: { pipelines: PipelineRun[] }): void {
  const p = statePath();
  const dir = resolve(p, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, JSON.stringify(state) + "\n", "utf-8");
}

export function updatePipelineRun(name: string, ok: boolean, durationMs: number): void {
  const state = loadOperationalState();
  const existing = state.pipelines.find((p) => p.name === name);
  if (existing) {
    existing.lastRun = new Date().toISOString();
    existing.lastOk = ok;
    existing.totalRuns++;
    if (!ok) existing.failedRuns++;
    existing.avgDurationMs = Math.round(
      (existing.avgDurationMs * (existing.totalRuns - 1) + durationMs) / existing.totalRuns,
    );
  } else {
    state.pipelines.push({
      name,
      lastRun: new Date().toISOString(),
      lastOk: ok,
      totalRuns: 1,
      failedRuns: ok ? 0 : 1,
      avgDurationMs: durationMs,
    });
  }
  saveOperationalState(state);
}

export function getOperationalStatus(): OperationalStatus {
  const cfg = loadConfig();
  const state = loadOperationalState();
  const running = isSchedulerRunning();
  const uptimeMs = getSchedulerUptime();
  const s = Math.floor(uptimeMs / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const uptimeFormatted = `${h}h ${m % 60}m ${s % 60}s`;

  return {
    t: new Date().toISOString(),
    scheduler: { running, uptimeMs, uptimeFormatted },
    pipelines: state.pipelines.map((p) => ({
      name: p.name,
      lastRun: p.lastRun,
      lastOk: p.lastOk,
      totalRuns: p.totalRuns,
      failedRuns: p.failedRuns,
      avgDurationMs: p.avgDurationMs,
    })),
    fetch: {
      consecutiveFailures: getConsecutiveFailures(),
      lastFailure: getLastFailureTime(),
    },
  };
}

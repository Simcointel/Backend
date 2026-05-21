import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { getDataRoot } from "./intelligenceUtils.js";
import { makeEventId } from "./relationalUtils.js";
import type { AnomalyEvent } from "./anomalyEngine.js";
import type { DivergenceEvent } from "./divergenceEngine.js";
import type { ContagionSignal } from "./contagionEngine.js";

export type EventSeverity = "critical" | "warning" | "info";
export type EventSource = "anomaly" | "divergence" | "contagion" | "regime";

export interface AlertEvent {
  id: string;
  ty: string;
  se: EventSeverity;
  ca: string;
  ti: string;
  de: string;
  da: Record<string, unknown>;
  ts: string;
  ex: string;
  so: EventSource;
}

interface ActiveEvent {
  id: string;
  typeKey: string;
  expiresAt: string;
}

interface EventState {
  events: ActiveEvent[];
}

function loadEventState(realm: number): EventState {
  const p = resolve(getDataRoot(), "state", "events", `realm-${realm}.json`);
  if (!existsSync(p)) return { events: [] };
  try { return JSON.parse(readFileSync(p, "utf-8")) as EventState; }
  catch { return { events: [] }; }
}

function saveEventState(realm: number, state: EventState): void {
  const p = resolve(getDataRoot(), "state", "events", `realm-${realm}.json`);
  const dir = resolve(p, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, JSON.stringify(state) + "\n", "utf-8");
}

function appendToDailyFile(realm: number, event: AlertEvent): void {
  const date = event.ts.slice(0, 10);
  const dir = resolve(getDataRoot(), "aggregates", "events", `realm-${realm}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const p = resolve(dir, `${date}.json`);

  let events: AlertEvent[] = [];
  if (existsSync(p)) {
    try { events = JSON.parse(readFileSync(p, "utf-8")); }
    catch { events = []; }
  }

  if (events.length >= loadConfig().relational.maxEventsPerDay) return;
  events.push(event);
  writeFileSync(p, JSON.stringify(events) + "\n", "utf-8");
}

function makeTypeKey(ty: string, ca: string): string {
  return `${ty}::${ca}`;
}

function isActive(state: EventState, typeKey: string, now: string): boolean {
  const cutoff = new Date(now).getTime();
  return state.events.some((e) => e.typeKey === typeKey && new Date(e.expiresAt).getTime() > cutoff);
}

function isInCooldown(state: EventState, typeKey: string, now: string, cooldownMs: number): boolean {
  const relevant = state.events.filter((e) => e.typeKey === typeKey).sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
  if (relevant.length === 0) return false;
  const lastTime = new Date(relevant[0].expiresAt).getTime() - cooldownMs;
  return new Date(now).getTime() < lastTime + cooldownMs;
}

function pruneExpired(state: EventState, now: string): void {
  const cutoff = new Date(now).getTime();
  state.events = state.events.filter((e) => new Date(e.expiresAt).getTime() > cutoff);
}

export function generateEvents(realm: number, anomalies: AnomalyEvent[], divergences: DivergenceEvent[], contagionSignals: ContagionSignal[]): AlertEvent[] {
  const cfg = loadConfig();
  const cooldownMs = cfg.relational.alertCooldownMinutes * 60 * 1000;
  const expiryMs = cfg.relational.alertExpiryHours * 60 * 60 * 1000;
  const now = new Date().toISOString();
  const nowMs = new Date(now).getTime();

  let state = loadEventState(realm);
  pruneExpired(state, now);

  const newEvents: AlertEvent[] = [];

  const addIfNew = (ty: string, se: EventSeverity, ca: string, ti: string, de: string, da: Record<string, unknown>, source: EventSource): void => {
    const typeKey = makeTypeKey(ty, ca);
    if (isActive(state, typeKey, now)) return;
    if (isInCooldown(state, typeKey, now, cooldownMs)) return;

    const event: AlertEvent = {
      id: makeEventId(), ty, se, ca, ti, de, da,
      ts: now, ex: new Date(nowMs + expiryMs).toISOString(), so: source,
    };

    state.events.push({ id: event.id, typeKey, expiresAt: event.ex });
    saveEventState(realm, state);
    newEvents.push(event);
    appendToDailyFile(realm, event);
  };

  for (const a of anomalies) {
    addIfNew(a.ty, a.se as EventSeverity, a.ca, a.ti, a.de,
      { zs: a.zs, vl: a.vl, mn: a.mn, sd: a.sd }, "anomaly");
  }

  for (const d of divergences) {
    addIfNew(d.ty, d.se as EventSeverity, d.sc.join("+"), d.de, d.de,
      { sectors: d.sc, strength: d.st, direction: d.dr }, "divergence");
  }

  for (const c of contagionSignals) {
    addIfNew(c.ty, c.af.length > 3 ? "warning" : "info", c.so, c.de, c.de,
      { source: c.so, affected: c.af, strength: c.st }, "contagion");
  }

  if (newEvents.length > 0) {
    logger.info(`[realm ${realm}] Generated ${newEvents.length} new alert events${cfg.relational.alertWebhookUrl ? ", webhook configured" : ""}`);
  }

  return newEvents;
}

export function loadEvents(realm: number, limit = 100): AlertEvent[] {
  const dir = resolve(getDataRoot(), "aggregates", "events", `realm-${realm}`);
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, 10);

  const all: AlertEvent[] = [];
  for (const f of files) {
    try {
      const day = JSON.parse(readFileSync(join(dir, f), "utf-8")) as AlertEvent[];
      all.push(...day);
    } catch { /* skip */ }
    if (all.length >= limit) break;
  }

  return all.slice(0, limit);
}

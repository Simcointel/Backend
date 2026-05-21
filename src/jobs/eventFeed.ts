import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { loadConfig } from "../config/index.js";
import { getDataRoot } from "./intelligenceUtils.js";
import { loadEvents, type AlertEvent } from "./alertEngine.js";

export interface FeedEvent {
  id: string;
  ts: string;
  ty: string;
  se: string;
  ca: string;
  ti: string;
  de: string;
  so: string;
}

export interface UnifiedFeed {
  t: string;
  r: number;
  events: FeedEvent[];
  counts: { critical: number; warning: number; info: number };
  filtered: { severity?: string; category?: string };
}

function getLatestRelationalEvents(realm: number, prefix: string): Array<{ id: string; ts: string; ty: string; se: string; ca: string; ti: string; de: string; so: string }> {
  const dir = resolve(getDataRoot(), "aggregates", prefix, `realm-${realm}`);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
  if (files.length === 0) return [];

  try {
    const data = JSON.parse(readFileSync(join(dir, files[0]), "utf-8")) as Record<string, unknown>;
    let events: Array<Record<string, unknown>> = [];

    if (prefix === "anomalies" && Array.isArray((data as { an?: unknown[] }).an)) {
      events = (data as { an: Array<Record<string, unknown>> }).an.map((e) => ({
        ...e, so: "anomaly", ts: e.ts || data.t,
      }));
    } else if (prefix === "divergence" && Array.isArray((data as { di?: unknown[] }).di)) {
      events = (data as { di: Array<Record<string, unknown>> }).di.map((e) => ({
        ...e, so: "divergence", ts: e.ts || data.t,
      }));
    } else if (prefix === "contagion" && Array.isArray((data as { co?: unknown[] }).co)) {
      events = (data as { co: Array<Record<string, unknown>> }).co.map((e) => ({
        ...e, so: "contagion", ts: e.ts || data.t,
      }));
    }

    return events.map((e) => ({
      id: String(e.id || ""),
      ts: String(e.ts || ""),
      ty: String(e.ty || ""),
      se: String(e.se || "info"),
      ca: String(e.ca || "realm"),
      ti: String(e.ti || e.de || ""),
      de: String(e.de || ""),
      so: String(e.so || prefix),
    }));
  } catch { return []; }
}

export function getUnifiedFeed(realm: number, severity?: string, category?: string, limit = 200): UnifiedFeed {
  const anomalyEvents = getLatestRelationalEvents(realm, "anomalies");
  const divergenceEvents = getLatestRelationalEvents(realm, "divergence");
  const contagionEvents = getLatestRelationalEvents(realm, "contagion");
  const alertEvents = loadEvents(realm, 100).map((e) => ({
    id: e.id, ts: e.ts, ty: e.ty, se: e.se, ca: e.ca,
    ti: e.ti, de: e.de, so: e.so,
  }));

  let all: typeof anomalyEvents = [...anomalyEvents, ...divergenceEvents, ...contagionEvents, ...alertEvents];
  all.sort((a, b) => b.ts.localeCompare(a.ts));

  if (severity) all = all.filter((e) => e.se === severity);
  if (category) all = all.filter((e) => e.ca === category || e.ca.includes(category));

  all = all.slice(0, limit);

  const counts = { critical: 0, warning: 0, info: 0 };
  for (const e of all) { if (e.se === "critical") counts.critical++; else if (e.se === "warning") counts.warning++; else counts.info++; }

  return {
    t: new Date().toISOString(), r: realm,
    events: all,
    counts,
    filtered: { severity, category },
  };
}

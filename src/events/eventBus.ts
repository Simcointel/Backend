import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import type { EventType, BusEvent, EventHandler } from "./eventTypes.js";

const listeners = new Map<string, Set<EventHandler>>();

export function on(type: EventType, handler: EventHandler): void {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type)!.add(handler);
  const max = loadConfig().network.eventBusMaxListeners;
  if ((listeners.get(type)?.size || 0) > max) {
    logger.warn(`Event bus listener leak: ${type} has ${listeners.get(type)?.size} listeners (max: ${max})`);
  }
}

export function off(type: EventType, handler: EventHandler): void {
  listeners.get(type)?.delete(handler);
}

export function emit(type: EventType, data: Record<string, unknown>, realm?: number): void {
  const event: BusEvent = { type, timestamp: new Date().toISOString(), realm, data };
  const handlers = listeners.get(type);
  if (!handlers || handlers.size === 0) return;

  for (const handler of handlers) {
    try { handler(event); }
    catch (err) { logger.error(`Event handler error for ${type}`, err instanceof Error ? err.message : String(err)); }
  }
}

export function removeAllListeners(): void {
  listeners.clear();
}

export function getListenerCount(): number {
  let count = 0;
  for (const s of listeners.values()) count += s.size;
  return count;
}

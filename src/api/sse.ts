import { IncomingMessage, ServerResponse } from "http";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { on as onEvent, emit } from "../events/eventBus.js";
import { CHANNEL_MAP, type BusEvent } from "../events/eventTypes.js";
import { getBaseUrl } from "./urlHelper.js";

interface SseClient {
  id: string;
  res: ServerResponse;
  channels: Set<string>;
  createdAt: number;
  lastActivity: number;
}

const clients = new Map<string, SseClient>();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function makeId(): string {
  return `sse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function sendSseEvent(client: SseClient, eventName: string, data: unknown): void {
  try {
    client.res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    client.lastActivity = Date.now();
  } catch {
    removeClient(client.id);
  }
}

function removeClient(id: string): void {
  const client = clients.get(id);
  if (!client) return;
  try { client.res.end(); } catch { /* ignore */ }
  clients.delete(id);
  logger.info(`SSE client ${id} disconnected (${clients.size} remaining)`);
}

function broadcastEvent(event: BusEvent): void {
  for (const [_, client] of clients) {
    for (const [channel, types] of Object.entries(CHANNEL_MAP)) {
      if (!client.channels.has(channel) && channel !== "__all__") continue;
      if (types.includes(event.type)) {
        sendSseEvent(client, event.type.replace(/:/g, "_"), {
          t: event.timestamp,
          r: event.realm,
          d: event.data,
          ch: channel,
        });
      }
    }
  }
}

function startHeartbeat(): void {
  if (heartbeatTimer) return;
  const interval = loadConfig().network.sseHeartbeatIntervalMs;
  heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, client] of clients) {
      if (now - client.lastActivity > interval * 3) {
        removeClient(id);
        continue;
      }
      sendSseEvent(client, "heartbeat", { t: new Date().toISOString() });
    }
    if (clients.size === 0 && heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }, interval);
}

export function handleSseConnection(req: IncomingMessage, res: ServerResponse): void {
  const cfg = loadConfig();
  if (!cfg.network.enableRealtimeGateway) {
    res.writeHead(404);
    res.end("Realtime gateway disabled");
    return;
  }

  if (clients.size >= cfg.network.sseMaxConnections) {
    res.writeHead(503);
    res.end("Too many connections");
    return;
  }

  const url = new URL(req.url || "", getBaseUrl(req));
  const channelsParam = url.searchParams.get("channels") || "dashboard,alerts";
  const channelSet = new Set(channelsParam.split(",").map((c) => c.trim()));

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const client: SseClient = {
    id: makeId(),
    res,
    channels: channelSet,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };

  clients.set(client.id, client);

  sendSseEvent(client, "connected", { id: client.id, channels: [...channelSet], timestamp: new Date().toISOString() });

  logger.info(`SSE client ${client.id} connected (channels: ${channelsParam}, total: ${clients.size})`);

  req.on("close", () => removeClient(client.id));

  startHeartbeat();
}

export function initSseEventBus(): void {
  const types = new Set(Object.values(CHANNEL_MAP).flat());
  for (const type of types) {
    onEvent(type as import("../events/eventTypes.js").EventType, (event) => {
      broadcastEvent(event);
    });
  }
  logger.info(`SSE event bus initialized: ${clients.size} clients, ${types.size} event types`);
}

export function getSseClientCount(): number {
  return clients.size;
}

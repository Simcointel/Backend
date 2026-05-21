import { getBaseUrl } from "../urlHelper.js";
import { IncomingMessage, ServerResponse } from "http";
import { sendVersionedSuccess, sendVersionedError, getSchema } from "../contract.js";
import { getSseClientCount } from "../sse.js";
import { getListenerCount } from "../../events/eventBus.js";
import { CHANNEL_MAP } from "../../events/eventTypes.js";
import { getChannelVersion } from "../deltaBroadcast.js";
import { generateHydrationPayload } from "../hydration.js";
import { loadConfig } from "../../config/index.js";

export async function handleRealtimeStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendVersionedSuccess(res, {
    gateway: {
      enabled: loadConfig().network.enableRealtimeGateway,
      sseClients: getSseClientCount(),
      maxConnections: loadConfig().network.sseMaxConnections,
      heartbeatIntervalMs: loadConfig().network.sseHeartbeatIntervalMs,
    },
    eventBus: {
      listenerCount: getListenerCount(),
      maxListeners: loadConfig().network.eventBusMaxListeners,
    },
    apiVersion: loadConfig().network.apiVersion,
  });
}

export async function handleRealtimeStreams(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const streams = Object.entries(CHANNEL_MAP).map(([channel, types]) => ({
    channel,
    eventTypes: types,
    version: getChannelVersion(channel).version,
    lastUpdated: getChannelVersion(channel).timestamp,
  }));

  sendVersionedSuccess(res, {
    streams,
    sseEndpoint: "/api/sse",
    connectInstruction: `Connect to /api/sse?channels=dashboard,alerts,events,sectors,regimes,operational,health`,
  });
}

export async function handleRealtimeSchema(req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendVersionedSuccess(res, getSchema());
}

export async function handleRealtimeHydration(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "", getBaseUrl(req));
  const compact = url.searchParams.get("compact") === "true";
  const payload = generateHydrationPayload();

  if (compact) {
    const compacted: Record<string, unknown> = {
      t: payload.t,
      r: payload.r,
      d: {} as Record<string, { scores: unknown; regime: unknown }>,
      o: payload.operational,
    };
    for (const [key, val] of Object.entries(payload.dashboard)) {
      const v = val as { scores?: unknown; regime?: unknown };
      (compacted.d as Record<string, unknown>)[key] = { sc: v.scores, rg: v.regime };
    }
    sendVersionedSuccess(res, compacted);
    return;
  }

  sendVersionedSuccess(res, payload);
}

export async function handleRealtimeVersion(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const cfg = loadConfig();
  sendVersionedSuccess(res, {
    apiVersion: cfg.network.apiVersion,
    gatewayEnabled: cfg.network.enableRealtimeGateway,
    contractVersioned: cfg.network.enableContractVersioning,
    sseHeartbeatIntervalMs: cfg.network.sseHeartbeatIntervalMs,
    supportedChannels: Object.keys(CHANNEL_MAP),
    generatedAt: new Date().toISOString(),
  });
}

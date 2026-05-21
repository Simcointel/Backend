// Version tracking for delta-aware broadcasting.
// Each channel has a version counter. Consumers can track their last known version
// and request only what changed since then.

interface ChannelVersion {
  version: number;
  timestamp: string;
}

const versions = new Map<string, ChannelVersion>();

export function getChannelVersion(channel: string): { version: number; timestamp: string } {
  return versions.get(channel) || { version: 0, timestamp: "" };
}

export function bumpChannelVersion(channel: string): { version: number; timestamp: string } {
  const existing = versions.get(channel);
  const next = {
    version: (existing?.version || 0) + 1,
    timestamp: new Date().toISOString(),
  };
  versions.set(channel, next);
  return next;
}

export interface DeltaPayload<T> {
  ch: string;
  v: number;
  t: string;
  data: T;
}

export function makeDelta<T>(channel: string, data: T): DeltaPayload<T> {
  const v = bumpChannelVersion(channel);
  return { ch: channel, v: v.version, t: v.timestamp, data };
}

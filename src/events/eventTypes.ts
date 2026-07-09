export type EventType =
  | "pipeline:macro:complete"
  | "pipeline:intelligence:complete"
  | "pipeline:relational:complete"
  | "pipeline:dashboard:complete"
  | "pipeline:forecast:complete"
  | "alert:generated"
  | "regime:changed"
  | "forecast:regime-shift"
  | "forecast:confidence-change"
  | "forecast:major-reversal"
  | "forecast:bubble-warning"
  | "forecast:crash-warning"
  | "scheduler:cycle-start"
  | "scheduler:cycle-end"
  | "scheduler:failure"
  | "fetch:complete"
  | "system:health-change";

export interface BusEvent {
  type: EventType;
  timestamp: string;
  realm?: number;
  data: Record<string, unknown>;
}

export type EventHandler = (event: BusEvent) => void;

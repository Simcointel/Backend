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

export const CHANNEL_MAP: Record<string, EventType[]> = {
  dashboard: ["pipeline:dashboard:complete", "pipeline:macro:complete", "pipeline:intelligence:complete"],
  alerts: ["alert:generated"],
  events: ["alert:generated", "regime:changed", "scheduler:failure"],
  sectors: ["pipeline:intelligence:complete"],
  regimes: ["regime:changed", "pipeline:intelligence:complete"],
  operational: ["scheduler:cycle-start", "scheduler:cycle-end", "scheduler:failure", "fetch:complete", "pipeline:macro:complete", "pipeline:intelligence:complete", "pipeline:relational:complete", "pipeline:dashboard:complete"],
  health: ["system:health-change", "scheduler:failure", "fetch:complete"],
  forecasts: ["pipeline:forecast:complete", "forecast:regime-shift", "forecast:confidence-change", "forecast:major-reversal"],
  signals: ["forecast:bubble-warning", "forecast:crash-warning", "forecast:major-reversal"],
  simulations: ["pipeline:forecast:complete"],
  public: ["pipeline:dashboard:complete", "pipeline:forecast:complete", "alert:generated", "scheduler:cycle-end", "fetch:complete"],
};

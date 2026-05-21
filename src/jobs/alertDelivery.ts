import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { sendAlert } from "./alerter.js";
import type { AlertEvent } from "./alertEngine.js";

export function deliverAlerts(events: AlertEvent[]): void {
  const cfg = loadConfig();
  const webhookUrl = cfg.relational.alertWebhookUrl || cfg.alerts.webhookUrl;
  if (!webhookUrl || !cfg.relational.enableAlerting) return;

  const critical = events.filter((e) => e.se === "critical");
  const warnings = events.filter((e) => e.se === "warning");
  const toDeliver = [...critical, ...warnings];

  if (toDeliver.length === 0) return;

  const fields = toDeliver.map((e) => ({
    name: `[${e.se.toUpperCase()}] ${e.ti}`,
    value: e.de.slice(0, 200),
    inline: false,
  }));

  const highestLevel = critical.length > 0 ? "error" as const : "warn" as const;

  sendAlert(webhookUrl, {
    title: `🔔 SimcoIntel ${toDeliver.length > 1 ? `${toDeliver.length} Alerts` : "Alert"}`,
    message: `${critical.length} critical, ${warnings.length} warning events`,
    level: highestLevel,
    fields,
  }).then((ok) => {
    if (ok) logger.info(`Delivered ${toDeliver.length} alerts via webhook`);
    else logger.warn(`Failed to deliver ${toDeliver.length} alerts`);
  }).catch((err) => {
    logger.error("Alert delivery error", err instanceof Error ? err.message : String(err));
  });
}

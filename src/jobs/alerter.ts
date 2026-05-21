import { logger } from "../logging/logger.js";

export interface AlertPayload {
  title: string;
  message: string;
  level: "info" | "warn" | "error";
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export async function sendAlert(webhookUrl: string, payload: AlertPayload): Promise<boolean> {
  if (!webhookUrl) {
    logger.debug("No webhook URL configured – alert suppressed");
    return false;
  }

  const color =
    payload.level === "error" ? 0xed4245
    : payload.level === "warn" ? 0xfaa61a
    : 0x5865f2;

  const body = {
    embeds: [{
      title: payload.title,
      description: payload.message,
      color,
      timestamp: new Date().toISOString(),
      fields: payload.fields ?? [],
    }],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      logger.warn(`Alert webhook returned ${res.status}`);
      return false;
    }

    logger.info(`Alert sent: ${payload.title}`);
    return true;
  } catch (err) {
    logger.warn("Failed to send alert", err instanceof Error ? err.message : String(err));
    return false;
  }
}

export async function sendFailureAlert(
  webhookUrl: string,
  consecutive: number,
  threshold: number,
): Promise<boolean> {
  return sendAlert(webhookUrl, {
    title: "⚠️ Fetch Failures Exceeding Threshold",
    message: `Consecutive fetch failures: **${consecutive}** (threshold: ${threshold}).`,
    level: "error",
    fields: [
      { name: "Consecutive Failures", value: String(consecutive), inline: true },
      { name: "Threshold", value: String(threshold), inline: true },
    ],
  });
}

import { IncomingMessage, ServerResponse } from "http";
import { sendSuccess, sendError } from "../middleware.js";
import { generateHealthReport } from "../../health/health.js";
import { getFailureStatus } from "../../jobs/failureTracker.js";
import { loadConfig } from "../../config/index.js";
import { isSchedulerRunning, getSchedulerUptime } from "../../jobs/scheduler.js";

export async function handleStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const cfg = loadConfig();
    const health = await generateHealthReport();
    const failures = getFailureStatus(cfg.schedules.consecutiveFailureThreshold);
    const status = {
      health,
      failures,
      scheduler: {
        running: isSchedulerRunning(),
        uptimeMs: getSchedulerUptime(),
      },
      realms: cfg.simco.realms,
      timestamp: new Date().toISOString(),
    };
    sendSuccess(res, status);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Status check failed");
  }
}

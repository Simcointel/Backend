import { IncomingMessage, ServerResponse } from "http";
import { sendSuccess, sendError } from "../middleware.js";
import { executeAction } from "../../admin/index.js";
import { loadConfig } from "../../config/index.js";
import { startScheduler, shutdown, isSchedulerRunning } from "../../jobs/scheduler.js";
import { RouteParams } from "../../api/router.js";
import { logger } from "../../logging/logger.js";

const VALID_ACTIONS = ["fetch", "aggregate", "analytics", "cleanup", "compress", "status", "reload-config", "get-config", "update-config", "set-log-level", "government-orders", "public-export", "restaurant-sync"];

export async function handleAction(req: IncomingMessage, res: ServerResponse, params: RouteParams, body: Record<string, unknown> | undefined, action: string): Promise<void> {
  if (!VALID_ACTIONS.includes(action)) {
    return sendError(res, 404, `Unknown action: ${action}`);
  }

  const requestBody = body;

  try {
    const result = await executeAction(action, requestBody);
    if (result.ok) {
      sendSuccess(res, result.result);
    } else {
      sendError(res, 400, result.error || "Action failed");
    }
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Action failed");
  }
}

export async function handleSchedulerControl(req: IncomingMessage, res: ServerResponse, params: RouteParams, body: Record<string, unknown> | undefined, cmd: string): Promise<void> {
  switch (cmd) {
    case "start":
      if (isSchedulerRunning()) {
        return sendSuccess(res, { status: "already running" });
      }
      startScheduler().catch((err) => {
        logger.error("Scheduler crashed:", err);
      });
      return sendSuccess(res, { status: "started" });

    case "stop":
      shutdown();
      return sendSuccess(res, { status: "stopping" });

    case "status":
      return sendSuccess(res, { running: isSchedulerRunning() });

    default:
      return sendError(res, 404, `Unknown scheduler command: ${cmd}. Use start, stop, or status.`);
  }
}

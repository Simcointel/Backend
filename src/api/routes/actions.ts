import { IncomingMessage, ServerResponse } from "http";
import { sendSuccess, sendError, parseJsonBody } from "../middleware.js";
import { executeAction } from "../../admin/index.js";
import { loadConfig } from "../../config/index.js";
import { startScheduler, shutdown, isSchedulerRunning } from "../../jobs/scheduler.js";

const VALID_ACTIONS = ["fetch", "aggregate", "analytics", "cleanup", "compress", "status", "reload-config", "get-config", "update-config", "set-log-level"];

export async function handleAction(req: IncomingMessage, res: ServerResponse, action: string): Promise<void> {
  if (!VALID_ACTIONS.includes(action)) {
    return sendError(res, 404, `Unknown action: ${action}`);
  }

  let body: Record<string, unknown> | undefined;
  if (req.method === "POST") {
    try {
      body = (await parseJsonBody(req)) as Record<string, unknown> | undefined;
    } catch {
      body = undefined;
    }
  }

  try {
    const result = await executeAction(action, body);
    if (result.ok) {
      sendSuccess(res, result.result);
    } else {
      sendError(res, 400, result.error || "Action failed");
    }
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Action failed");
  }
}

export async function handleSchedulerControl(req: IncomingMessage, res: ServerResponse, cmd: string): Promise<void> {
  switch (cmd) {
    case "start":
      if (isSchedulerRunning()) {
        return sendSuccess(res, { status: "already running" });
      }
      startScheduler().catch((err) => {
        console.error("Scheduler crashed:", err);
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

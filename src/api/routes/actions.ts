import { Request, Response } from "express";
import { sendSuccess, sendError } from "../middleware.js";
import { executeAction } from "../../admin/index.js";
import { loadConfig } from "../../config/index.js";
import { startScheduler, shutdown, isSchedulerRunning } from "../../jobs/scheduler.js";
import { RouteParams } from "../../api/router.js";

const VALID_ACTIONS = ["fetch", "aggregate", "analytics", "cleanup", "compress", "status", "reload-config", "get-config", "update-config", "set-log-level", "government-orders", "public-export"];

export async function handleAction(req: Request, res: Response, params: RouteParams, body: Record<string, unknown> | undefined, action: string): Promise<void> {
  console.log(`[handleAction] START action=${action}`);
  if (!VALID_ACTIONS.includes(action)) {
    console.log(`[handleAction] Invalid action: ${action}`);
    return sendError(res, 404, `Unknown action: ${action}`);
  }

  const requestBody = req.body as Record<string, unknown> | undefined;
  console.log(`[handleAction] body=`, JSON.stringify(requestBody));

  try {
    console.log(`[handleAction] calling executeAction`);
    const result = await executeAction(action, requestBody);
    console.log(`[handleAction] executeAction returned:`, JSON.stringify(result).slice(0, 500));
    if (result.ok) {
      console.log(`[handleAction] sending success`);
      sendSuccess(res, result.result);
      console.log(`[handleAction] sent success`);
    } else {
      console.log(`[handleAction] sending error`);
      sendError(res, 400, result.error || "Action failed");
      console.log(`[handleAction] sent error`);
    }
    console.log(`[handleAction] DONE`);
  } catch (err) {
    console.error(`[handleAction] error=`, err);
    sendError(res, 500, err instanceof Error ? err.message : "Action failed");
  }
}

export async function handleSchedulerControl(req: Request, res: Response, params: RouteParams, body: Record<string, unknown> | undefined, cmd: string): Promise<void> {
  console.log(`[handleSchedulerControl] cmd=${cmd}`);
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

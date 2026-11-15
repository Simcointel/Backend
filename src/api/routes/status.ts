import { IncomingMessage, ServerResponse } from "http";
import { sendSuccess, sendError } from "../middleware.js";
import { generateHealthReport } from "../../health/health.js";
import { getFailureStatus } from "../../jobs/failureTracker.js";
import { loadConfig } from "../../config/index.js";
import { isSchedulerRunning, getSchedulerUptime } from "../../jobs/scheduler.js";

/**
 * @swagger
 * tags:
 *   name: Status
 *   description: System status endpoints
 */

/**
 * @swagger
 * /api/status:
 *   get:
 *     summary: Get system status including health, scheduler, and failures
 *     tags: [Status]
 *     responses:
 *       200:
 *         description: System status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StatusResponse'
 *       500:
 *         description: Status check failed
 */
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
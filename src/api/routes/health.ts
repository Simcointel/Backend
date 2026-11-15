import { IncomingMessage, ServerResponse } from "http";
import { sendSuccess, sendError } from "../middleware.js";
import { generateHealthReport } from "../../health/health.js";

/**
 * @swagger
 * tags:
 *   name: Health
 *   description: Health check endpoints
 */

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Get system health report
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Health report
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       500:
 *         description: Health check failed
 */
export async function handleHealth(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const report = await generateHealthReport();
    sendSuccess(res, report);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Health check failed");
  }
}
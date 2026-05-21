import { IncomingMessage, ServerResponse } from "http";
import { sendSuccess, sendError } from "../middleware.js";
import { generateHealthReport } from "../../health/health.js";

export async function handleHealth(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const report = await generateHealthReport();
    sendSuccess(res, report);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Health check failed");
  }
}

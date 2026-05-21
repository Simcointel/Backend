import { IncomingMessage, ServerResponse } from "http";

export function getBaseUrl(req?: IncomingMessage): string {
  if (!req || !req.headers) {
    return "http://localhost"; // Fallback for local CLI/jobs where no request exists
  }
  const host = req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] || "http";

  if (!host) {
    return "http://localhost";
  }

  return `${protocol}://${host}`;
}

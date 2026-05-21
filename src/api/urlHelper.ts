import { IncomingMessage, ServerResponse } from "http";

export function getBaseUrl(req: IncomingMessage): string {
  const host = (req && req.headers && req.headers.host) || "localhost";
  const protocol = (req && req.headers && req.headers["x-forwarded-proto"]) || "http";
  return `${protocol}://${host}`;
}

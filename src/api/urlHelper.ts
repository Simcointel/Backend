import { IncomingMessage, ServerResponse } from "http";

export function getBaseUrl(req: IncomingMessage): string {
  const host = (req && req.headers && req.headers.host) || "localhost";
  const protocol = (req.socket as { encrypted?: boolean }).encrypted ? "https" : "http";
  return `${protocol}://${host}`;
}

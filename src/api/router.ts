import { IncomingMessage, ServerResponse } from "http";

export interface RouteParams {
  [key: string]: string;
}

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: RouteParams,
  body?: unknown,
) => void | Promise<void>;

interface Route {
  method: string;
  pattern: string;
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];

  get(pattern: string, handler: RouteHandler): void {
    this.routes.push({ method: "GET", pattern, handler });
  }

  post(pattern: string, handler: RouteHandler): void {
    this.routes.push({ method: "POST", pattern, handler });
  }

  put(pattern: string, handler: RouteHandler): void {
    this.routes.push({ method: "PUT", pattern, handler });
  }

  match(method: string, url: string): { handler: RouteHandler; params: RouteParams } | null {
    const parsed = new URL(url, "http://localhost");
    const pathname = parsed.pathname;

    for (const route of this.routes) {
      if (route.method !== method) continue;

      const params = this.matchPath(route.pattern, pathname);
      if (params !== null) {
        return { handler: route.handler, params };
      }
    }

    return null;
  }

  private matchPath(pattern: string, pathname: string): RouteParams | null {
    const patternParts = pattern.split("/");
    const pathParts = pathname.split("/");

    if (patternParts.length !== pathParts.length) return null;

    const params: RouteParams = {};

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(":")) {
        params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (patternParts[i] !== pathParts[i]) {
        return null;
      }
    }

    return params;
  }
}

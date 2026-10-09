import { Request, Response } from "express";

export interface RouteParams {
  [key: string]: string;
}

export type RouteHandler = (
  req: Request,
  res: Response,
  params: RouteParams,
  body?: unknown,
  action?: string,
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

  match(method: string, url: string, baseUrl: string = "http://localhost"): { handler: RouteHandler; params: RouteParams; action?: string } | null {
      const parsed = new URL(url, baseUrl);
      const pathname = parsed.pathname;

      for (const route of this.routes) {
        if (route.method !== method) continue;

        const params = this.matchPath(route.pattern, pathname);
        if (params !== null) {
          // For actions route, extract action string from params
          let action: string | undefined;
          if (route.pattern.startsWith("/api/actions/") && params.action) {
            action = params.action;
          } else if (route.pattern.startsWith("/api/actions/scheduler/") && params.cmd) {
            action = params.cmd;
          }
          return { handler: route.handler, params, action };
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

import { IncomingMessage, ServerResponse } from "http";
import { sendSuccess, sendError } from "../middleware.js";
import { getCircuitBreaker, CircuitBreaker } from "../circuitBreaker.js";
import { logger } from "../../logging/logger.js";

const SIMCOMPANIES_BASE = "https://www.simcompanies.com";

const simCompaniesBreaker = getCircuitBreaker("simcompanies", {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  timeoutReset: 60000,
});

interface ProxyRequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

async function proxyToSimCompanies(
  path: string,
  options: ProxyRequestOptions = {}
): Promise<{ data: unknown; status: number }> {
  const url = `${SIMCOMPANIES_BASE}${path}`;
  const controller = new AbortController();
  const timeout = options.timeout ?? 10000;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        "User-Agent": "SimcoIntel/1.0",
        "Accept": "application/json",
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await res.json();
    return { data, status: res.status };
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("SimCompanies API request timeout");
    }
    throw err;
  }
}

async function proxyWithCircuitBreaker(
  path: string,
  options: ProxyRequestOptions = {}
): Promise<{ data: unknown; status: number }> {
  return simCompaniesBreaker.execute(
    () => proxyToSimCompanies(path, options),
    async () => {
      logger.warn(`[SimCompanies Proxy] Circuit breaker OPEN for ${path}, returning fallback`);
      return { data: { error: "Service temporarily unavailable", fallback: true }, status: 503 };
    }
  );
}

/**
 * @swagger
 * /api/public/simcompanies/challenges/current:
 *   get:
 *     summary: Get current challenges
 *     tags: [Public - SimCompanies Proxy]
 *     responses:
 *       200:
 *         description: Current challenges data
 *       500:
 *         description: Failed to fetch from SimCompanies
 */
export async function handleSimCompaniesChallengesCurrent(
  req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  _body: unknown,
  query: URLSearchParams
): Promise<void> {
  try {
    const result = await proxyWithCircuitBreaker("/api/v1/challenges/current/");
    if (result.status >= 400) {
      sendError(res, result.status, "Failed to fetch challenges");
      return;
    }
    sendSuccess(res, result.data);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to fetch challenges");
  }
}

/**
 * @swagger
 * /api/public/simcompanies/challenges/{challengeId}/leaderboard:
 *   get:
 *     summary: Get challenge leaderboard
 *     tags: [Public - SimCompanies Proxy]
 *     parameters:
 *       - in: path
 *         name: challengeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Challenge slug/ID
 *     responses:
 *       200:
 *         description: Leaderboard data
 *       500:
 *         description: Failed to fetch from SimCompanies
 */
export async function handleSimCompaniesChallengeLeaderboard(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  _body: unknown,
  _query: URLSearchParams
): Promise<void> {
  try {
    const challengeId = params.challengeId;
    if (!challengeId) {
      sendError(res, 400, "Challenge ID required");
      return;
    }
    const result = await proxyWithCircuitBreaker(`/api/v1/challenges/${encodeURIComponent(challengeId)}/leaderboard/`);
    if (result.status >= 400) {
      sendError(res, result.status, "Failed to fetch leaderboard");
      return;
    }
    sendSuccess(res, result.data);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to fetch leaderboard");
  }
}

/**
 * @swagger
 * /api/public/simcompanies/market-ticker/{realmId}:
 *   get:
 *     summary: Get market ticker for a realm
 *     tags: [Public - SimCompanies Proxy]
 *     parameters:
 *       - in: path
 *         name: realmId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Realm ID
 *     responses:
 *       200:
 *         description: Market ticker data
 *       500:
 *         description: Failed to fetch from SimCompanies
 */
export async function handleSimCompaniesMarketTicker(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  _body: unknown,
  _query: URLSearchParams
): Promise<void> {
  try {
    const realmId = params.realmId;
    if (!realmId) {
      sendError(res, 400, "Realm ID required");
      return;
    }
    const result = await proxyWithCircuitBreaker(`/api/v3/market-ticker/${encodeURIComponent(realmId)}/`);
    if (result.status >= 400) {
      sendError(res, result.status, "Failed to fetch market ticker");
      return;
    }
    sendSuccess(res, result.data);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to fetch market ticker");
  }
}

/**
 * @swagger
 * /api/public/simcompanies/resources-retail-info/{realmId}:
 *   get:
 *     summary: Get resources retail info for a realm
 *     tags: [Public - SimCompanies Proxy]
 *     parameters:
 *       - in: path
 *         name: realmId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Realm ID
 *     responses:
 *       200:
 *         description: Resources retail info data
 *       500:
 *         description: Failed to fetch from SimCompanies
 */
export async function handleSimCompaniesResourcesRetailInfo(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  _body: unknown,
  _query: URLSearchParams
): Promise<void> {
  try {
    const realmId = params.realmId;
    if (!realmId) {
      sendError(res, 400, "Realm ID required");
      return;
    }
    const result = await proxyWithCircuitBreaker(`/api/v4/${encodeURIComponent(realmId)}/resources-retail-info/`);
    if (result.status >= 400) {
      sendError(res, result.status, "Failed to fetch retail info");
      return;
    }
    sendSuccess(res, result.data);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to fetch retail info");
  }
}

/**
 * @swagger
 * /api/public/simcompanies/company/{companyId}:
 *   get:
 *     summary: Get company data (supports realm via query param)
 *     tags: [Public - SimCompanies Proxy]
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *       - in: query
 *         name: realm
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Realm number (0=Magnates, 1=Entrepreneurs, 2=Challenge)
 *     responses:
 *       200:
 *         description: Company data
 *       500:
 *         description: Failed to fetch from SimCompanies
 */
export async function handleSimCompaniesCompany(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  _body: unknown,
  query: URLSearchParams
): Promise<void> {
  try {
    const companyId = params.companyId;
    if (!companyId) {
      sendError(res, 400, "Company ID required");
      return;
    }
    const realm = parseInt(query.get("realm") ?? "0");
    const base = realm === 1
      ? "/api/v3/entrepreneurs/companies/"
      : realm === 2
        ? "/api/v3/entrepreneurs/companies/"  // Challenge realm uses entrepreneurs API
        : "/api/v3/companies/";
    
    const result = await proxyWithCircuitBreaker(`${base}${encodeURIComponent(companyId)}/`);
    if (result.status >= 400) {
      sendError(res, result.status, "Failed to fetch company data");
      return;
    }
    sendSuccess(res, result.data);
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to fetch company data");
  }
}

/**
 * @swagger
 * /api/public/simcompanies/calculator-live/{realmId}:
 *   get:
 *     summary: Get calculator live data for a realm (proxied to SimCompanies market data)
 *     tags: [Public - SimCompanies Proxy]
 *     parameters:
 *       - in: path
 *         name: realmId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Realm ID
 *     responses:
 *       200:
 *         description: Calculator live data
 *       500:
 *         description: Failed to fetch from SimCompanies
 */
export async function handleSimCompaniesCalculatorLive(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  _body: unknown,
  _query: URLSearchParams
): Promise<void> {
  try {
    const realmId = params.realmId;
    if (!realmId) {
      sendError(res, 400, "Realm ID required");
      return;
    }
    // This proxies to market-ticker which has live prices
    const result = await proxyWithCircuitBreaker(`/api/v3/market-ticker/${encodeURIComponent(realmId)}/`);
    if (result.status >= 400) {
      sendError(res, result.status, "Failed to fetch calculator live data");
      return;
    }
    // Transform market-ticker to calculator-live format
    const marketData = result.data as Array<{ kind: number; price: number; is_up: boolean; realmId: number }>;
    const livePrices: Record<number, Record<number, number>> = {};
    for (const item of marketData) {
      if (!livePrices[item.kind]) livePrices[item.kind] = {};
      livePrices[item.kind][0] = item.price; // Q0 price
    }
    sendSuccess(res, {
      generatedAt: new Date().toISOString(),
      dataFreshnessMinutes: 0,
      livePrices,
      realm: Number(realmId),
    });
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : "Failed to fetch calculator live data");
  }
}
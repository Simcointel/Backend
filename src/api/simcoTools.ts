import { logger } from "../logging/logger.js";
import { ApiError } from "../errors/errors.js";
import { getCircuitBreaker, CircuitBreaker } from "./circuitBreaker.js";

export interface Resource {
  id: number;
  name: string;
  producedAnHour: number;
  wages: number;
  transportation: number;
  inputs: Record<string, { name: string; quantity: number }>;
  isResearch: boolean;
  speedModifier: number;
  retailInfo: Array<Record<string, unknown>> | null;
  producedAt: number; // Building ID
}

export interface Building {
  id: number;
  name: string;
  wages: number;
}

export interface ResourcesResponse {
  resources: Resource[];
}

export interface VwapEntry {
  datetime: string;
  resourceId: number;
  quality: number;
  vwap: number;
}

export interface PriceEntry {
  datetime: string;
  resourceId: number;
  quality: number;
  price: number;
}

export interface RealmStatus {
  realm_id: number;
  summary: {
    date: string;
    activeCompanies: number;
    companiesValue: number;
    totalBuildings: number;
    bondsSold: number;
    phase: string;
    completed: boolean;
  };
}

export interface RealmSummaryEntry {
  date: string;
  activeCompanies: number;
  companiesValue: number;
  totalBuildings: number;
  bondsSold: number;
  phase: string;
  completed: boolean;
}

export interface RealmSummariesResponse {
  metadata: {
    current_page: number;
    page_size: number;
    last_page: number;
    total_records: number;
  };
  summaries: RealmSummaryEntry[];
}

export interface CompanyData {
  id: number;
  name: string;
  buildings: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface CompanyBuilding {
  building: number;
  level: number;
  [key: string]: unknown;
}

export interface GovernmentOrder {
  id: number;
  name: string;
  description: string;
  resourceId: number;
  quantity: number;
  reward: number;
  deadline: string;
  status: "active" | "completed" | "expired";
}

export interface GovernmentOrdersResponse {
  orders: GovernmentOrder[];
}

export interface MarketCandlestick {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Client pool keyed by realm
const clientPool = new Map<number, SimcoToolsClient>();

export class SimcoToolsClient {
  private baseUrl: string;
  private lastRequestTime = 0;
  private minInterval: number;
  private apiKey?: string;
  private circuitBreaker: CircuitBreaker;

  constructor(realm: number = 0, apiBaseUrl?: string, minInterval = 600, apiKey?: string) {
    const base = apiBaseUrl ? apiBaseUrl.replace(/\/+$/, "") : "https://api.simcotools.com/v1/realms";
    this.baseUrl = `${base}/${realm}`;
    this.minInterval = minInterval;
    this.apiKey = apiKey;
    this.circuitBreaker = getCircuitBreaker(`simcotools-realm-${realm}`, {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
      timeoutReset: 60000,
    });
  }

  static getOrCreate(realm: number, apiBaseUrl?: string, minInterval = 600, apiKey?: string): SimcoToolsClient {
    const existing = clientPool.get(realm);
    if (existing) return existing;
    const client = new SimcoToolsClient(realm, apiBaseUrl, minInterval, apiKey);
    clientPool.set(realm, client);
    return client;
  }

  static clearPool(): void {
    clientPool.clear();
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (this.minInterval > 0 && elapsed < this.minInterval) {
      await new Promise((r) => setTimeout(r, this.minInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private async fetchJson<T>(path: string, params?: Record<string, string>, signal?: AbortSignal): Promise<T> {
    return this.circuitBreaker.execute(
      async () => {
        await this.rateLimit();

        const url = new URL(`${this.baseUrl}${path}`);
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
          }
        }

        logger.debug("API request", url.toString());

        const headers: Record<string, string> = { accept: "application/json" };
        if (this.apiKey) {
          headers["Authorization"] = `Bearer ${this.apiKey}`;
        }

        const res = await fetch(url.toString(), {
          headers,
          signal,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new ApiError(
            `API returned ${res.status} for ${path}`,
            res.status,
            body.slice(0, 500),
          );
        }

        return (await res.json()) as T;
      },
      async () => {
        logger.warn(`[SimcoToolsClient] Circuit breaker OPEN for ${path}, returning fallback`);
        throw new ApiError(`Circuit breaker open for ${path}`, 503, "Service temporarily unavailable");
      }
    );
  }

  async getResources(disablePagination = true): Promise<ResourcesResponse> {
    const params: Record<string, string> = {};
    if (disablePagination) {
      params.disable_pagination = "True";
    }
    return this.fetchJson<ResourcesResponse>("/resources", params);
  }

  async getMarketVwaps(): Promise<VwapEntry[]> {
    const data = await this.fetchJson<unknown>("/market/vwaps");
    if (Array.isArray(data)) return data as VwapEntry[];
    if (data && typeof data === "object" && "vwaps" in data) {
      return (data as { vwaps: VwapEntry[] }).vwaps;
    }
    throw new ApiError("Unexpected VWAP response shape");
  }

  async getMarketPrices(): Promise<PriceEntry[]> {
    const data = await this.fetchJson<unknown>("/market/prices");
    if (Array.isArray(data)) return data as PriceEntry[];
    if (data && typeof data === "object" && "prices" in data) {
      return (data as { prices: PriceEntry[] }).prices;
    }
    throw new ApiError("Unexpected prices response shape");
  }

  async getRealmStatus(): Promise<RealmStatus> {
    return this.fetchJson<RealmStatus>("");
  }

  async getRealmSummaries(page = 1, pageSize = 50): Promise<RealmSummariesResponse> {
    return this.fetchJson<RealmSummariesResponse>("/summaries", {
      page: String(page),
      page_size: String(pageSize),
    });
  }

  async getCompany(userId: number): Promise<CompanyData> {
    return this.fetchJson<CompanyData>(`/companies/${userId}`);
  }

  async getBuildings(): Promise<Building[]> {
    const data = await this.fetchJson<unknown>("/buildings");
    if (Array.isArray(data)) return data as Building[];
    if (data && typeof data === "object" && "buildings" in data) {
      return (data as { buildings: Building[] }).buildings;
    }
    throw new ApiError("Unexpected buildings response shape");
  }

  async getGovernmentOrders(): Promise<GovernmentOrdersResponse> {
    const data = await this.fetchJson<unknown>("/government-orders");
    if (Array.isArray(data)) return { orders: data as GovernmentOrder[] };
    if (data && typeof data === "object" && "orders" in data) {
      return { orders: (data as { orders: GovernmentOrder[] }).orders };
    }
    throw new ApiError("Unexpected government orders response shape");
  }

  async getMarketCandlesticks(resourceId: number, quality: number, _startDate?: string, _endDate?: string): Promise<MarketCandlestick[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const data = await this.fetchJson<unknown>(`/market/resources/${resourceId}/${quality}/candlesticks`, undefined, controller.signal);
      if (Array.isArray(data)) return data as MarketCandlestick[];
      if (data && typeof data === "object" && "candlesticks" in data) return (data as { candlesticks: MarketCandlestick[] }).candlesticks;
      if (data && typeof data === "object" && "results" in data) return (data as { results: MarketCandlestick[] }).results;
      throw new ApiError(`Unexpected candlesticks response shape for resource ${resourceId} quality ${quality}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function checkApiHealth(client: SimcoToolsClient): Promise<{ ok: boolean; detail: string }> {
  try {
    const resources = await client.getResources(true);
    const count = resources.resources?.length ?? 0;
    if (count > 0) {
      return { ok: true, detail: `Reachable, ${count} resources loaded` };
    }
    return { ok: true, detail: "Reachable, but 0 resources returned" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg };
  }
}

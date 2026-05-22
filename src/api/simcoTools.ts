import { logger } from "../logging/logger.js";
import { ApiError } from "../errors/errors.js";

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

export class SimcoToolsClient {
  private baseUrl: string;
  private lastRequestTime = 0;

  constructor(realm: number = 0, apiBaseUrl?: string) {
    const base = apiBaseUrl ? apiBaseUrl.replace(/\/+$/, "") : "https://api.simcotools.com/v1/realms";
    this.baseUrl = `${base}/${realm}`;
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const minInterval = 600;
    if (elapsed < minInterval) {
      await new Promise((r) => setTimeout(r, minInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private async fetchJson<T>(path: string, params?: Record<string, string>): Promise<T> {
    await this.rateLimit();

    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    logger.debug("API request", url.toString());

    const res = await fetch(url.toString(), {
      headers: { accept: "application/json" },
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

  async getMarketCandlesticks(resourceId: number, quality: number, startDate?: string, endDate?: string): Promise<any[]> {
    const params: Record<string, string> = {};
    if (startDate) params.start = startDate;
    if (endDate) params.end = endDate;
    const data = await this.fetchJson<unknown>(`/market/resources/${resourceId}/${quality}/candlesticks`, params);
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && "candlesticks" in data) return (data as { candlesticks: any[] }).candlesticks;
    if (data && typeof data === "object" && "results" in data) return (data as { results: any[] }).results;
    throw new ApiError(`Unexpected candlesticks response shape for resource ${resourceId} quality ${quality}`);
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

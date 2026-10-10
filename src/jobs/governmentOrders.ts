import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { SimcoToolsClient } from "../api/simcoTools.js";
import { DataRepoWriter, getDataRepoWriter } from "../storage/dataRepoWriter.js";

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

export interface GovernmentOrdersReport {
  t: string;
  r: number;
  orders: GovernmentOrder[];
}

export async function fetchGovernmentOrders(realm: number): Promise<GovernmentOrdersResponse> {
  const cfg = loadConfig();
  const client = SimcoToolsClient.getOrCreate(realm, cfg.simco.apiBaseUrl);
  
  // Government orders endpoint - client baseUrl already includes realm, so use relative path
  const data = await client.getGovernmentOrders();
  
  if (Array.isArray(data)) return { orders: data as GovernmentOrder[] };
  if (data && typeof data === "object" && "orders" in data) {
    return { orders: (data as { orders: GovernmentOrder[] }).orders };
  }
  throw new Error("Unexpected government orders response shape");
}

export async function computeGovernmentOrders(realm: number): Promise<{ ok: boolean; report: GovernmentOrdersReport | null; error?: string }> {
  try {
    const result = await fetchGovernmentOrders(realm);
    
    const report: GovernmentOrdersReport = {
      t: new Date().toISOString(),
      r: realm,
      orders: result.orders,
    };

    const cfg = loadConfig();
    const writer = getDataRepoWriter(cfg.dataRepo);
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const subDir = `snapshots/government/orders/realm-${realm}`;
    
    await writer.writeSnapshot(
      { timestamp, snapshotType: "government-orders", data: report },
      subDir,
    );
    
    logger.info(`[realm ${realm}] Government orders fetched: ${result.orders.length} orders`);
    return { ok: true, report };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[realm ${realm}] Failed to fetch government orders`, msg);
    return { ok: false, report: null, error: msg };
  }
}

export interface GovernmentOrdersResult {
  ok: boolean;
  results: Array<{ realm: number; ok: boolean; count: number }>;
  reports: GovernmentOrdersReport[];
}

export async function runAllGovernmentOrders(): Promise<GovernmentOrdersResult> {
  const cfg = loadConfig();
  const reports: GovernmentOrdersReport[] = [];
  const results = await Promise.allSettled(
    cfg.simco.realms.map(async (r) => {
      const res = await computeGovernmentOrders(r);
      if (res.ok && res.report) {
        reports.push(res.report);
      }
      return { realm: r, ok: res.ok, count: res.report?.orders.length ?? 0 };
    })
  );

  const fulfilled: Array<{ realm: number; ok: boolean; count: number }> = [];
  let allOk = true;
  for (const r of results) {
    if (r.status === "fulfilled") {
      fulfilled.push(r.value);
      if (!r.value.ok) {
        allOk = false;
        logger.warn(`Government orders realm ${r.value.realm} failed`);
      }
    } else {
      allOk = false;
      logger.warn(`Government orders rejected: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  }

  const totalOrders = fulfilled.reduce((s, r) => s + r.count, 0);
  logger.info(`Government orders: ${fulfilled.filter((r) => r.ok).length}/${fulfilled.length} realms ok, ${totalOrders} orders`);
  return { ok: allOk, results: fulfilled, reports };
}
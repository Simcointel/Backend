import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { logger } from "../logging/logger.js";
import { loadConfig } from "../config/index.js";
import { getDataRoot, loadIndexHistory } from "./intelligenceUtils.js";

export interface CriticalResource {
  category: string;
  dependencyScore: number;
  bottleneckRisk: number;
  upstreamPressure: number;
  downstreamPressure: number;
  vulnerableSectors: string[];
}

export interface BottleneckChain {
  chain: string[];
  score: number;
  description: string;
}

export interface DependencyRisk {
  category: string;
  riskScore: number;
  upstreamCount: number;
  downstreamCount: number;
  avgDependencyWeight: number;
  isCritical: boolean;
}

export interface DependencyResult {
  t: string;
  r: number;
  criticalResources: CriticalResource[];
  bottleneckChains: BottleneckChain[];
  risks: DependencyRisk[];
  ok: boolean;
  error?: string;
}

export function computeDependencies(realm: number): DependencyResult {
  const cfg = loadConfig();
  const depCfg = cfg.dependency;
  const matrix = depCfg.dependencyMatrix;
  const categories = Object.keys(cfg.macroIndexes.categories);

  const risks: DependencyRisk[] = categories.map((cat) => {
    const weights = matrix[cat] || {};
    const upstream = Object.entries(weights).filter(([, w]) => w > 0).length;
    const downstream = Object.entries(matrix).filter(([, w]) => w[cat] !== undefined && w[cat] > 0).length;
    const avgWeight = upstream > 0 ? Object.values(weights).reduce((a, b) => a + b, 0) / upstream : 0;
    const riskScore = Math.min(1, (upstream * 0.15 + downstream * 0.1 + avgWeight * 0.5));
    return {
      category: cat, riskScore: Math.round(riskScore * 100) / 100,
      upstreamCount: upstream, downstreamCount: downstream,
      avgDependencyWeight: Math.round(avgWeight * 100) / 100,
      isCritical: riskScore >= depCfg.criticalResourceThreshold,
    };
  });

  const criticalResources: CriticalResource[] = risks
    .filter((r) => r.isCritical)
    .map((r) => {
      const vulnerableSectors = Object.entries(matrix)
        .filter(([cat, weights]) => weights[r.category] !== undefined && weights[r.category] > depCfg.bottleneckThreshold)
        .map(([cat]) => cat);
      const upstreamPressure = r.upstreamCount * depCfg.upstreamPressureWeight;
      const downstreamPressure = r.downstreamCount * depCfg.downstreamPressureWeight;
      return {
        category: r.category,
        dependencyScore: r.riskScore,
        bottleneckRisk: Math.min(1, Math.round((r.riskScore + vulnerableSectors.length * 0.1) * 100) / 100),
        upstreamPressure: Math.round(upstreamPressure * 100) / 100,
        downstreamPressure: Math.round(downstreamPressure * 100) / 100,
        vulnerableSectors,
      };
    });

  const bottleneckChains: BottleneckChain[] = [];
  function findChains(start: string, path: string[], depth: number, maxDepth: number): void {
    if (depth >= maxDepth) return;
    const weights = matrix[start];
    if (!weights) return;
    for (const [next, w] of Object.entries(weights)) {
      if (w > depCfg.bottleneckThreshold && !path.includes(next)) {
        const chain = [...path, next];
        bottleneckChains.push({
          chain,
          score: Math.round(w * 100) / 100,
          description: `${chain.join(" -> ")} (weight: ${w})`,
        });
        findChains(next, chain, depth + 1, maxDepth);
      }
    }
  }

  for (const cat of categories) {
    findChains(cat, [cat], 0, depCfg.cascadeDepthMax);
  }
  bottleneckChains.sort((a, b) => b.score - a.score);

  const topChains = bottleneckChains.slice(0, 10);

  logger.info(`[realm ${realm}] Dependencies: ${criticalResources.length} critical resources, ${topChains.length} bottleneck chains`);
  return {
    t: new Date().toISOString(), r: realm,
    criticalResources, bottleneckChains: topChains, risks,
    ok: true,
  };
}

export function computeAllDependencies(): Promise<{ ok: boolean; results: DependencyResult[] }> {
  const cfg = loadConfig();
  const results = cfg.simco.realms.map((r) => {
    try { return computeDependencies(r); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { t: new Date().toISOString(), r, criticalResources: [], bottleneckChains: [], risks: [], ok: false, error: msg };
    }
  });
  const allOk = results.some((r) => r.ok);
  logger.info(`Dependencies computed: ${results.filter((r) => r.ok).length}/${results.length} realms ok`);
  return Promise.resolve({ ok: allOk, results });
}

export interface EnvCheck {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

const REQUIRED: { key: string; desc: string }[] = [
  { key: "SIMCO_REALMS", desc: "Comma-separated realm IDs" },
  { key: "DATA_REPO_PATH", desc: "Path to data directory" },
  { key: "HTTP_PORT", desc: "HTTP server port" },
];

const RECOMMENDED: { key: string; desc: string }[] = [
  { key: "GITHUB_TOKEN", desc: "For data repo commits" },
  { key: "ALERT_WEBHOOK_URL", desc: "Discord alert delivery" },
  { key: "DATA_REPO_OWNER", desc: "GitHub owner for data repo" },
];

export function validateEnv(): EnvCheck {
  const result: EnvCheck = { ok: true, missing: [], warnings: [] };

  for (const r of REQUIRED) {
    if (!process.env[r.key]) {
      result.missing.push(`${r.key} (${r.desc})`);
      result.ok = false;
    }
  }

  for (const r of RECOMMENDED) {
    if (!process.env[r.key]) {
      result.warnings.push(`${r.key} (${r.desc})`);
    }
  }

  return result;
}

export function printEnvStatus(): void {
  const check = validateEnv();
  if (check.ok && check.warnings.length === 0) {
    console.log("Environment: OK");
    return;
  }

  if (!check.ok) {
    console.error("Environment: MISSING REQUIRED VARIABLES");
    for (const m of check.missing) console.error(`  MISSING: ${m}`);
  }

  for (const w of check.warnings) console.warn(`  WARNING: ${w}`);
}

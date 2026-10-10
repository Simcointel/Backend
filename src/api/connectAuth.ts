import { logger } from "../logging/logger.js";

let cachedToken: string | null = null;

async function getVercelConnectToken(): Promise<string | null> {
  try {
    const { getToken } = await import("@vercel/connect");
    const connector = process.env.VERCEL_CONNECT_GITHUB ?? "github/default";
    const token = await getToken(connector, {
      subject: { type: "app" },
    });
    return token ?? null;
  } catch (err) {
    logger.error(`Vercel Connect failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function getGithubToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const fromConnect = await getVercelConnectToken();
  if (fromConnect) {
    cachedToken = fromConnect;
    return cachedToken;
  }

  const fromEnv = process.env.GITHUB_TOKEN ?? "";
  if (fromEnv) {
    cachedToken = fromEnv;
    return cachedToken;
  }

  logger.warn("No token available — Vercel Connect and GITHUB_TOKEN both empty");
  return "";
}

export function clearGithubTokenCache(): void {
  cachedToken = null;
}

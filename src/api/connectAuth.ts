let cachedToken: string | null = null;

async function getVercelConnectToken(): Promise<string | null> {
  try {
    const { getToken } = await import("@vercel/connect");
    const connector = process.env.VERCEL_CONNECT_GITHUB ?? "github/default";
    console.log(`[connectAuth] Trying Vercel Connect with connector: ${connector}`);
    const token = await getToken(connector, {
      subject: { type: "app" },
    });
    console.log(`[connectAuth] Vercel Connect returned: ${token ? `${token.length} chars` : "null"}`);
    return token ?? null;
  } catch (err) {
    console.error(`[connectAuth] Vercel Connect failed:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function getGithubToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const fromConnect = await getVercelConnectToken();
  if (fromConnect) {
    cachedToken = fromConnect;
    console.log(`[connectAuth] Got token from Vercel Connect (${fromConnect.length} chars)`);
    return cachedToken;
  }

  const fromEnv = process.env.GITHUB_TOKEN ?? "";
  if (fromEnv) {
    cachedToken = fromEnv;
    console.log(`[connectAuth] Got token from GITHUB_TOKEN env var (${fromEnv.length} chars)`);
    return cachedToken;
  }

  console.log(`[connectAuth] No token available — Vercel Connect and GITHUB_TOKEN both empty`);
  return "";
}

export function clearGithubTokenCache(): void {
  cachedToken = null;
}

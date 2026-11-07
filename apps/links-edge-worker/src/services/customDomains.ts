/**
 * apps/links-edge-worker/src/services/customDomains.ts
 * Cloudflare for SaaS Custom Hostname Verification & Edge CNAME Mapping
 */

export interface CustomDomainConfig {
  hostname: string;
  tenant_id: string;
  cloudflare_hostname_id?: string;
  ssl_status: "pending" | "active" | "error";
  is_active: boolean;
}

/**
 * Registers custom domain with Cloudflare for SaaS API
 */
export async function registerCustomHostname(
  apiToken: string,
  zoneId: string,
  hostname: string,
  fetchFn: typeof fetch = fetch
): Promise<{ success: boolean; hostnameId?: string; error?: string }> {
  try {
    const resp = await fetchFn(`https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hostname,
        ssl: {
          method: "http",
          type: "dv",
          settings: {
            min_tls_version: "1.3",
            http2: "on",
          },
        },
      }),
    });

    const data = (await resp.json().catch(() => ({}))) as {
      success: boolean;
      result?: { id: string };
      errors?: Array<{ message: string }>;
    };

    if (data.success && data.result?.id) {
      return { success: true, hostnameId: data.result.id };
    }

    return { success: false, error: data.errors?.[0]?.message || "Cloudflare API error" };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Resolves incoming Host header to custom domain record from KV
 */
export async function resolveCustomDomain(
  hostname: string,
  kv: KVNamespace
): Promise<CustomDomainConfig | null> {
  const cleanHost = hostname.toLowerCase().split(":")[0];
  // Ignore native root domain and apexes
  if (
    cleanHost === "links.sunshade.icu" ||
    cleanHost === "staging-links.sunshade.icu" ||
    cleanHost === "localhost" ||
    cleanHost.endsWith(".workers.dev")
  ) {
    return null;
  }

  try {
    const raw = await kv.get(`domain:${cleanHost}`, { type: "json" });
    if (!raw) return null;
    return raw as CustomDomainConfig;
  } catch {
    return null;
  }
}

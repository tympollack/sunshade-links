/**
 * scripts/provision-links-dns.ts
 * Automates Cloudflare Apex DNS, SSL Routing, and Root Domain Intercepts for sunshade-links
 */

export interface CloudflareDnsRecord {
  id?: string;
  type: "CNAME" | "A" | "AAAA" | "TXT";
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export interface CloudflarePageRule {
  id?: string;
  targets: Array<{ target: "url"; constraint: { operator: "matches"; value: string } }>;
  actions: Array<{ id: string; value?: Record<string, unknown> | string | number }>;
  priority: number;
  status: "active" | "disabled";
}

export interface ZoneSslSettings {
  ssl: "strict" | "full" | "flexible" | "off";
  always_use_https: "on" | "off";
  min_tls_version: "1.3" | "1.2" | "1.1" | "1.0";
  security_header?: {
    strict_transport_security?: {
      enabled: boolean;
      max_age: number;
      include_subdomains: boolean;
      preload: boolean;
    };
  };
}

export interface ProvisionPlan {
  dnsRecords: CloudflareDnsRecord[];
  pageRules: CloudflarePageRule[];
  sslSettings: ZoneSslSettings;
}

/**
 * Builds the canonical DNS & SSL configuration plan for SunShade Links
 */
export function buildDnsProvisionPlan(workerTarget = "sunshade-links-edge.workers.dev"): ProvisionPlan {
  return {
    dnsRecords: [
      {
        type: "CNAME",
        name: "links.sunshade.icu",
        content: workerTarget,
        proxied: true,
        ttl: 1, // Auto
      },
      {
        type: "CNAME",
        name: "cname.links.sunshade.icu",
        content: workerTarget,
        proxied: true,
        ttl: 1,
      },
      {
        type: "CNAME",
        name: "staging-links.sunshade.icu",
        content: workerTarget,
        proxied: true,
        ttl: 1,
      },
    ],
    pageRules: [
      {
        targets: [
          {
            target: "url",
            constraint: {
              operator: "matches",
              value: "pymenergy.com/links*",
            },
          },
        ],
        actions: [
          {
            id: "forwarding_url",
            value: {
              url: "https://links.sunshade.icu/$1",
              status_code: 301,
            },
          },
        ],
        priority: 1,
        status: "active",
      },
      {
        targets: [
          {
            target: "url",
            constraint: {
              operator: "matches",
              value: "http://links.sunshade.icu/*",
            },
          },
        ],
        actions: [
          {
            id: "always_use_https",
          },
        ],
        priority: 2,
        status: "active",
      },
    ],
    sslSettings: {
      ssl: "strict",
      always_use_https: "on",
      min_tls_version: "1.3",
      security_header: {
        strict_transport_security: {
          enabled: true,
          max_age: 31536000, // 1 year (365 days)
          include_subdomains: true,
          preload: true,
        },
      },
    },
  };
}

/**
 * Executes DNS provisioning via Cloudflare API v4
 */
export async function executeDnsProvisioning(
  apiToken: string,
  zoneId: string,
  fetchFn: typeof fetch = fetch
): Promise<{ success: boolean; applied: number; errors: string[] }> {
  const plan = buildDnsProvisionPlan();
  const errors: string[] = [];
  let applied = 0;

  if (!apiToken) {
    errors.push("Missing Cloudflare API Token (CLOUDFLARE_API_TOKEN)");
    return { success: false, applied: 0, errors };
  }

  const headers = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };

  // 1. Provision DNS Records
  for (const record of plan.dnsRecords) {
    try {
      const resp = await fetchFn(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
        method: "POST",
        headers,
        body: JSON.stringify(record),
      });
      if (resp.ok) {
        applied++;
      } else {
        const body = (await resp.json().catch(() => ({}))) as { errors?: Array<{ message: string }> };
        errors.push(`DNS record ${record.name} failed: ${body.errors?.[0]?.message || resp.statusText}`);
      }
    } catch (err: unknown) {
      errors.push(`DNS record ${record.name} error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Configure SSL / HSTS Settings
  try {
    const sslResp = await fetchFn(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/always_use_https`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ value: plan.sslSettings.always_use_https }),
    });
    if (sslResp.ok) {
      applied++;
    } else {
      const body = (await sslResp.json().catch(() => ({}))) as { errors?: Array<{ message: string }> };
      errors.push(`Always Use HTTPS setting failed: ${body.errors?.[0]?.message || sslResp.statusText}`);
    }

    const tlsResp = await fetchFn(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/min_tls_version`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ value: plan.sslSettings.min_tls_version }),
    });
    if (tlsResp.ok) {
      applied++;
    } else {
      const body = (await tlsResp.json().catch(() => ({}))) as { errors?: Array<{ message: string }> };
      errors.push(`Min TLS version setting failed: ${body.errors?.[0]?.message || tlsResp.statusText}`);
    }

    const sslModeResp = await fetchFn(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/ssl`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ value: plan.sslSettings.ssl }),
    });
    if (sslModeResp.ok) {
      applied++;
    } else {
      const body = (await sslModeResp.json().catch(() => ({}))) as { errors?: Array<{ message: string }> };
      errors.push(`SSL mode setting failed: ${body.errors?.[0]?.message || sslModeResp.statusText}`);
    }

    if (plan.sslSettings.security_header) {
      const hstsResp = await fetchFn(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/security_header`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ value: plan.sslSettings.security_header }),
      });
      if (hstsResp.ok) {
        applied++;
      } else {
        const body = (await hstsResp.json().catch(() => ({}))) as { errors?: Array<{ message: string }> };
        errors.push(`HSTS security header setting failed: ${body.errors?.[0]?.message || hstsResp.statusText}`);
      }
    }
  } catch (err: unknown) {
    errors.push(`SSL settings update error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Configure Page Rules (ANALYSIS_0003: Only post rules matching the target zone domain)
  for (const rule of plan.pageRules) {
    const targetUrl = rule.targets[0]?.constraint?.value || "";
    // Cloudflare rejects page rules for foreign domains on the current zone
    // Foreign rules (e.g. pymenergy.com) must be provisioned against their own zone
    if (targetUrl && !targetUrl.includes("sunshade.icu")) {
      continue;
    }

    try {
      const ruleResp = await fetchFn(`https://api.cloudflare.com/client/v4/zones/${zoneId}/pagerules`, {
        method: "POST",
        headers,
        body: JSON.stringify(rule),
      });
      if (ruleResp.ok) {
        applied++;
      } else {
        const body = (await ruleResp.json().catch(() => ({}))) as { errors?: Array<{ message: string }> };
        errors.push(`Page rule failed: ${body.errors?.[0]?.message || ruleResp.statusText}`);
      }
    } catch (err: unknown) {
      errors.push(`Page rule error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    success: errors.length === 0,
    applied,
    errors,
  };
}

if (process.env.NODE_ENV !== "test" && typeof process !== "undefined" && require.main === module) {
  const token = process.env.CLOUDFLARE_API_TOKEN || "";
  const zone = process.env.CLOUDFLARE_ZONE_ID || "";
  executeDnsProvisioning(token, zone).then((res) => {
    console.log("DNS Provisioning Results:", res);
    process.exit(res.success ? 0 : 1);
  });
}

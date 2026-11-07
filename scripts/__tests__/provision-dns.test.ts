import { describe, it, expect, vi } from "vitest";
import { buildDnsProvisionPlan, executeDnsProvisioning } from "../provision-links-dns";

describe("provision-links-dns", () => {
  it("generates correct DNS records, page rules, and strict SSL settings", () => {
    const plan = buildDnsProvisionPlan("sunshade-links-edge.workers.dev");

    // Apex & CNAME records
    expect(plan.dnsRecords).toHaveLength(3);
    const apex = plan.dnsRecords.find((r) => r.name === "links.sunshade.icu");
    expect(apex).toBeDefined();
    expect(apex?.type).toBe("CNAME");
    expect(apex?.content).toBe("sunshade-links-edge.workers.dev");
    expect(apex?.proxied).toBe(true);

    const fallbackCname = plan.dnsRecords.find((r) => r.name === "cname.links.sunshade.icu");
    expect(fallbackCname?.proxied).toBe(true);

    // Page rule proxying pymenergy.com/links* -> links.sunshade.icu/*
    const proxyRule = plan.pageRules.find((pr) =>
      pr.targets.some((t) => t.constraint.value === "pymenergy.com/links*")
    );
    expect(proxyRule).toBeDefined();
    expect(proxyRule?.actions[0].id).toBe("forwarding_url");
    expect(proxyRule?.actions[0].value).toEqual({
      url: "https://links.sunshade.icu/$1",
      status_code: 301,
    });

    // SSL / TLS 1.3 / HSTS settings
    expect(plan.sslSettings.min_tls_version).toBe("1.3");
    expect(plan.sslSettings.always_use_https).toBe("on");
    expect(plan.sslSettings.security_header?.strict_transport_security?.max_age).toBe(31536000);
  });

  it("handles missing token cleanly", async () => {
    const res = await executeDnsProvisioning("", "zone-123");
    expect(res.success).toBe(false);
    expect(res.errors[0]).toContain("Missing Cloudflare API Token");
  });

  it("provisions records through mocked Cloudflare API", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({ success: true, result: {} }),
      } as unknown as Response;
    });

    const res = await executeDnsProvisioning("cf_valid_token", "zone_test_456", mockFetch);
    expect(res.success).toBe(true);
    expect(res.applied).toBeGreaterThanOrEqual(4);
    expect(mockFetch).toHaveBeenCalled();
  });
});

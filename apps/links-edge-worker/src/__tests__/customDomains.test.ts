import { describe, it, expect, vi } from "vitest";
import { resolveCustomDomain, registerCustomHostname } from "../services/customDomains";

describe("resolveCustomDomain", () => {
  it("returns null for native SunShade domains and localhost", async () => {
    const mockKv = {
      get: vi.fn(),
    } as any;

    expect(await resolveCustomDomain("links.sunshade.icu", mockKv)).toBeNull();
    expect(await resolveCustomDomain("staging-links.sunshade.icu", mockKv)).toBeNull();
    expect(await resolveCustomDomain("localhost:8787", mockKv)).toBeNull();
    expect(await resolveCustomDomain("test.workers.dev", mockKv)).toBeNull();
    expect(mockKv.get).not.toHaveBeenCalled();
  });

  it("queries KV for custom vanity hostname", async () => {
    const mockKv = {
      get: vi.fn().mockResolvedValue({
        hostname: "go.brand.com",
        tenant_id: "tenant-123",
        ssl_status: "active",
        is_active: true,
      }),
    } as any;

    const result = await resolveCustomDomain("go.brand.com", mockKv);
    expect(mockKv.get).toHaveBeenCalledWith("domain:go.brand.com", { type: "json" });
    expect(result).not.toBeNull();
    expect(result?.tenant_id).toBe("tenant-123");
  });
});

describe("registerCustomHostname", () => {
  it("registers domain successfully with Cloudflare SaaS API", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: { id: "cf-hostname-abc" },
        }),
        { status: 200 }
      )
    );

    const res = await registerCustomHostname("fake-token", "zone-123", "go.client.com", mockFetch as any);
    expect(res.success).toBe(true);
    expect(res.hostnameId).toBe("cf-hostname-abc");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones/zone-123/custom_hostnames",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("handles Cloudflare API failure gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ message: "Hostname already exists" }],
        }),
        { status: 400 }
      )
    );

    const res = await registerCustomHostname("fake-token", "zone-123", "go.client.com", mockFetch as any);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Hostname already exists");
  });
});

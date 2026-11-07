import { describe, it, expect, vi, beforeEach } from "vitest";
import worker, { Env, CachedLinkRecord } from "../index";

describe("Worker Fetch Handler", () => {
  let mockEnv: Env;
  let mockCtx: ExecutionContext;

  beforeEach(() => {
    mockEnv = {
      LINKS_KV: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      } as any,
      TELEMETRY_QUEUE: {
        send: vi.fn().mockResolvedValue(undefined),
      } as any,
      RATE_LIMITER: {
        limit: vi.fn().mockResolvedValue({ success: true }),
      } as any,
      SUPABASE_URL: "https://mock.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "mock-key",
    };

    mockCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as any;
  });

  it("handles health check endpoint /_health", async () => {
    const req = new Request("https://links.sunshade.icu/_health");
    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("links-edge-worker");
  });

  it("returns 404 for static asset bypasses like /favicon.ico", async () => {
    const req = new Request("https://links.sunshade.icu/favicon.ico");
    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(404);
  });

  it("enforces rate limit and responds with 429", async () => {
    mockEnv.RATE_LIMITER = {
      limit: vi.fn().mockResolvedValue({ success: false }),
    } as any;

    const req = new Request("https://links.sunshade.icu/test-slug", {
      headers: { "cf-connecting-ip": "1.2.3.4" },
    });
    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("10");
  });

  it("resolves short link from KV cache and redirects 302", async () => {
    const cachedRecord: CachedLinkRecord = {
      id: "lnk_123",
      tenant_id: "ten_456",
      slug: "promo",
      destination_url: "https://example.com/target?fbclid=surveillance123&keep=1",
      is_active: true,
      trust_score: 95,
    };

    (mockEnv.LINKS_KV.get as any).mockResolvedValue(cachedRecord);

    const req = new Request("https://links.sunshade.icu/promo?user=abc", {
      headers: {
        "cf-connecting-ip": "203.0.113.1",
        "cf-ipcountry": "US",
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      },
    });

    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    // Should strip fbclid surveillance param and preserve incoming user param and keep param
    expect(location).toContain("keep=1");
    expect(location).toContain("user=abc");
    expect(location).not.toContain("fbclid");
    expect(mockCtx.waitUntil).toHaveBeenCalled();
  });

  it("returns 410 Gone for expired links", async () => {
    const expiredRecord: CachedLinkRecord = {
      id: "lnk_expired",
      tenant_id: "ten_1",
      slug: "old",
      destination_url: "https://example.com",
      is_active: true,
      expires_at: new Date(Date.now() - 3600000).toISOString(),
    };

    (mockEnv.LINKS_KV.get as any).mockResolvedValue(expiredRecord);

    const req = new Request("https://links.sunshade.icu/old");
    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(410);
  });

  it("serves interstitial HTML warning when trust score < 60 without bypass parameter", async () => {
    const riskyRecord: CachedLinkRecord = {
      id: "lnk_risky",
      tenant_id: "ten_1",
      slug: "danger",
      destination_url: "http://untrusted-site.com",
      is_active: true,
      trust_score: 42,
    };

    (mockEnv.LINKS_KV.get as any).mockResolvedValue(riskyRecord);

    const req = new Request("https://links.sunshade.icu/danger");
    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Caution: Destination Degraded");
    expect(html).toContain("42/100");
  });

  it("bypasses interstitial warning when bypass_warning=1 is supplied", async () => {
    const riskyRecord: CachedLinkRecord = {
      id: "lnk_risky",
      tenant_id: "ten_1",
      slug: "danger",
      destination_url: "https://untrusted-site.com",
      is_active: true,
      trust_score: 42,
    };

    (mockEnv.LINKS_KV.get as any).mockResolvedValue(riskyRecord);

    const req = new Request("https://links.sunshade.icu/danger?bypass_warning=1");
    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://untrusted-site.com/");
  });
});

describe("Worker Queue Handler", () => {
  it("ingests click telemetry batch into Supabase RPC", async () => {
    const mockBatch = {
      messages: [
        {
          id: "msg-1",
          body: {
            link_id: "lnk-1",
            tenant_id: "ten-1",
            device_type: "mobile",
            browser: "safari",
            os: "ios",
            country_code: "US",
            is_bot: false,
            click_timestamp: new Date().toISOString(),
          },
        },
      ],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    };

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, inserted: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    global.fetch = mockFetch;

    const mockEnv: Env = {
      LINKS_KV: {} as any,
      TELEMETRY_QUEUE: {} as any,
      RATE_LIMITER: {} as any,
      SUPABASE_URL: "https://mock.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "mock-key",
    };

    await worker.queue(mockBatch as any, mockEnv);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://mock.supabase.co/rest/v1/rpc/ingest_click_batch",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(mockBatch.ackAll).toHaveBeenCalled();
  });
});

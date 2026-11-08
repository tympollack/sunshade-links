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

  it("escapes malicious destination URLs in interstitial warning (SEC_0005)", async () => {
    const maliciousRecord: CachedLinkRecord = {
      id: "lnk_malicious",
      tenant_id: "ten_1",
      slug: "xss",
      destination_url: 'https://evil.com/"<script>alert(1)</script>',
      is_active: true,
      trust_score: 25,
    };

    (mockEnv.LINKS_KV.get as any).mockResolvedValue(maliciousRecord);

    const req = new Request("https://links.sunshade.icu/xss");
    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("strips incoming surveillance tokens like fbclid and gclid (SEC_0006)", async () => {
    const cachedRecord: CachedLinkRecord = {
      id: "lnk_clean",
      tenant_id: "ten_1",
      slug: "clean-test",
      destination_url: "https://target.com/page",
      is_active: true,
      trust_score: 95,
    };

    (mockEnv.LINKS_KV.get as any).mockResolvedValue(cachedRecord);

    const req = new Request("https://links.sunshade.icu/clean-test?fbclid=incoming123&gclid=ads456&user_param=safe");
    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(302);
    const loc = res.headers.get("location");
    expect(loc).toContain("user_param=safe");
    expect(loc).not.toContain("fbclid");
    expect(loc).not.toContain("gclid");
  });

  it("challenges password-protected links with 401 until valid password provided (SEC_0003)", async () => {
    // "secret123" SHA-256
    const passwordHash = "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3";
    const protectedRecord: CachedLinkRecord = {
      id: "lnk_protected",
      tenant_id: "ten_1",
      slug: "secret",
      destination_url: "https://target.com/vault",
      is_active: true,
      password_hash: passwordHash,
      trust_score: 90,
    };

    (mockEnv.LINKS_KV.get as any).mockResolvedValue(protectedRecord);

    // 1. No password -> 401
    const req1 = new Request("https://links.sunshade.icu/secret");
    const res1 = await worker.fetch(req1, mockEnv, mockCtx);
    expect(res1.status).toBe(401);
    expect(await res1.text()).toContain('<form method="POST">');

    // 2. Wrong password via POST -> 401 with error (SEC_0003)
    const formDataWrong = new FormData();
    formDataWrong.set("pass", "wrong");
    const req2 = new Request("https://links.sunshade.icu/secret", {
      method: "POST",
      body: formDataWrong,
    });
    const res2 = await worker.fetch(req2, mockEnv, mockCtx);
    expect(res2.status).toBe(401);
    const html = await res2.text();
    expect(html).toContain("Incorrect password");

    // 3. Correct password via POST -> 303 redirect with cookie (SEC_0003)
    const formDataRight = new FormData();
    formDataRight.set("pass", "123");
    const req3 = new Request("https://links.sunshade.icu/secret", {
      method: "POST",
      body: formDataRight,
    });
    const res3 = await worker.fetch(req3, mockEnv, mockCtx);
    expect(res3.status).toBe(303);
    expect(res3.headers.get("location")).toBe("https://target.com/vault");
    expect(res3.headers.get("set-cookie")).toContain("sunshade_unlocked_secret=1");

    // 4. Subsequent GET with cookie -> 302 without password prompt
    const req4 = new Request("https://links.sunshade.icu/secret", {
      headers: { cookie: "sunshade_unlocked_secret=1" },
    });
    const res4 = await worker.fetch(req4, mockEnv, mockCtx);
    expect(res4.status).toBe(302);
    expect(res4.headers.get("location")).toBe("https://target.com/vault");
  });

  it("verifies salted PBKDF2 password hashes (SEC_0004)", async () => {
    // Generate salt and PBKDF2 hash for "topsecret"
    const saltHex = "0102030405060708090a0b0c0d0e0f10";
    const enc = new TextEncoder();
    const saltBytes = new Uint8Array(saltHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode("topsecret"),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const derived = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      256
    );
    const derivedHex = Array.from(new Uint8Array(derived)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const storedHash = `${saltHex}:${derivedHex}`;

    const pbkdf2Record: CachedLinkRecord = {
      id: "lnk_pbkdf2",
      tenant_id: "ten_1",
      slug: "vault",
      destination_url: "https://target.com/classified",
      is_active: true,
      password_hash: storedHash,
      trust_score: 99,
    };
    (mockEnv.LINKS_KV.get as any).mockResolvedValue(pbkdf2Record);

    const formData = new FormData();
    formData.set("pass", "topsecret");
    const req = new Request("https://links.sunshade.icu/vault", { method: "POST", body: formData });
    const res = await worker.fetch(req, mockEnv, mockCtx);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://target.com/classified");
  });

  it("rejects inactive or unverified custom domains with 403 / 404 (SEC_0002)", async () => {
    // 1. Unknown custom domain -> 404
    (mockEnv.LINKS_KV.get as any).mockResolvedValueOnce(null);
    const req1 = new Request("https://unconfigured.example.com/slug");
    const res1 = await worker.fetch(req1, mockEnv, mockCtx);
    expect(res1.status).toBe(404);
    expect(await res1.text()).toContain("Domain not configured");

    // 2. Inactive custom domain -> 403
    (mockEnv.LINKS_KV.get as any).mockResolvedValueOnce({
      hostname: "disabled.example.com",
      tenant_id: "ten_other",
      is_active: false,
      ssl_status: "active",
    });
    const req2 = new Request("https://disabled.example.com/slug");
    const res2 = await worker.fetch(req2, mockEnv, mockCtx);
    expect(res2.status).toBe(403);
    expect(await res2.text()).toContain("Custom domain is inactive or SSL is pending");

    // 3. SSL pending domain -> 403
    (mockEnv.LINKS_KV.get as any).mockResolvedValueOnce({
      hostname: "pending.example.com",
      tenant_id: "ten_other",
      is_active: true,
      ssl_status: "pending",
    });
    const req3 = new Request("https://pending.example.com/slug");
    const res3 = await worker.fetch(req3, mockEnv, mockCtx);
    expect(res3.status).toBe(403);
  });

  it("reserves dashboard routes and forwards to DASHBOARD_ORIGIN (BUG_0002)", async () => {
    mockEnv.DASHBOARD_ORIGIN = "https://sunshade-links-dashboard.pages.dev";
    const originalFetch = global.fetch;
    const fetchSpy = vi.fn().mockResolvedValue(new Response("Dashboard HTML", { status: 200 }));
    global.fetch = fetchSpy;

    try {
      const req1 = new Request("https://links.sunshade.icu/links");
      const res1 = await worker.fetch(req1, mockEnv, mockCtx);
      expect(res1.status).toBe(200);
      expect(await res1.text()).toBe("Dashboard HTML");
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ url: "https://sunshade-links-dashboard.pages.dev/links" })
      );
      expect(mockEnv.LINKS_KV.get).not.toHaveBeenCalled();

      const req2 = new Request("https://links.sunshade.icu/api/v1/links");
      await worker.fetch(req2, mockEnv, mockCtx);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ url: "https://sunshade-links-dashboard.pages.dev/api/v1/links" })
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("Worker Queue Handler", () => {
  it("retries batch when Supabase credentials are missing (BUG_0008)", async () => {
    const mockBatch = {
      messages: [{ id: "m-1", body: {} }],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    };
    const incompleteEnv: Env = {
      LINKS_KV: {} as any,
      TELEMETRY_QUEUE: {} as any,
      RATE_LIMITER: {} as any,
    };

    await worker.queue(mockBatch as any, incompleteEnv);
    expect(mockBatch.retryAll).toHaveBeenCalled();
    expect(mockBatch.ackAll).not.toHaveBeenCalled();
  });

  it("retries batch on Supabase RPC failure (BUG_0008)", async () => {
    const mockBatch = {
      messages: [{ id: "m-1", body: {} }],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    };
    global.fetch = vi.fn().mockResolvedValue(new Response("Internal Server Error", { status: 500 }));
    const mockEnv: Env = {
      LINKS_KV: {} as any,
      TELEMETRY_QUEUE: {} as any,
      RATE_LIMITER: {} as any,
      SUPABASE_URL: "https://mock.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "mock-key",
    };

    await worker.queue(mockBatch as any, mockEnv);
    expect(mockBatch.retryAll).toHaveBeenCalled();
    expect(mockBatch.ackAll).not.toHaveBeenCalled();
  });
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

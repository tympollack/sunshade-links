import { describe, it, expect, vi, beforeEach } from "vitest";
import { timingSafeCompare, authenticateRequest, AuthError } from "../lib/authGuard";

describe("timingSafeCompare", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeCompare("secret-token-123", "secret-token-123")).toBe(true);
    expect(timingSafeCompare("", "")).toBe(true);
  });

  it("returns false for different lengths or values", () => {
    expect(timingSafeCompare("short", "longer-string")).toBe(false);
    expect(timingSafeCompare("secret-1", "secret-2")).toBe(false);
  });
});

describe("authenticateRequest", () => {
  beforeEach(() => {
    delete process.env.DEV_AUTH_BYPASS_KEY;
    delete process.env.SUNSHADE_API_KEY;
  });

  it("throws AuthError on missing authorization and cookie", async () => {
    const req = new Request("https://links.sunshade.icu/api/v1/links");
    await expect(authenticateRequest(req)).rejects.toThrow(AuthError);
  });

  it("throws AuthError on malformed Authorization header", async () => {
    const req = new Request("https://links.sunshade.icu/api/v1/links", {
      headers: { Authorization: "Basic invalid_scheme" },
    });
    await expect(authenticateRequest(req)).rejects.toThrow("Malformed Authorization header");
  });

  it("authenticates successfully with DEV_AUTH_BYPASS_KEY", async () => {
    process.env.DEV_AUTH_BYPASS_KEY = "test-dev-secret";
    const req = new Request("https://links.sunshade.icu/api/v1/links", {
      headers: { Authorization: "Bearer test-dev-secret" },
    });

    const auth = await authenticateRequest(req);
    expect(auth.tenantId).toBe("ten_dev");
    expect(auth.role).toBe("admin");
    expect(auth.authType).toBe("dev");
  });

  it("authenticates master API key timing-safely", async () => {
    process.env.SUNSHADE_API_KEY = "tk_live_master_999";
    const req = new Request("https://links.sunshade.icu/api/v1/links", {
      headers: { Authorization: "Bearer tk_live_master_999" },
    });

    const auth = await authenticateRequest(req);
    expect(auth.tenantId).toBe("ten_master");
    expect(auth.role).toBe("service_role");
    expect(auth.authType).toBe("api_key");
  });
});

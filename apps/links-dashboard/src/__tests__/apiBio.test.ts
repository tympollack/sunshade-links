import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/v1/bio/[username]/route";
import * as authGuard from "@/lib/authGuard";
import * as supabaseLib from "@/lib/supabase";

describe("Bio API Route /api/v1/bio/[username] (SEC_0001, BUG_0003)", () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockSupabase = {
      schema: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.spyOn(supabaseLib, "getServiceSupabase").mockReturnValue(mockSupabase as any);
  });

  it("rejects unauthenticated POST requests with 401 (SEC_0001)", async () => {
    vi.spyOn(authGuard, "authenticateRequest").mockRejectedValue(
      new authGuard.AuthError("Missing Authorization or tenant credentials", 401)
    );

    const req = new NextRequest("http://localhost:3000/api/v1/bio/tymz", {
      method: "POST",
      body: JSON.stringify({ displayName: "Attacker Name" }),
    });

    const res = await POST(req, { params: Promise.resolve({ username: "tymz" }) });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("rejects cross-tenant bio modifications with 403 (SEC_0001)", async () => {
    vi.spyOn(authGuard, "authenticateRequest").mockResolvedValue({
      tenantId: "tenant_other",
      userId: "user_123",
      authType: "api_key",
      role: "member",
    });

    const req = new NextRequest("http://localhost:3000/api/v1/bio/tymz", {
      method: "POST",
      body: JSON.stringify({ displayName: "Attacker Name" }),
    });

    const res = await POST(req, { params: Promise.resolve({ username: "tymz" }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Forbidden");
  });

  it("persists bio profile to Supabase on authenticated POST (BUG_0003)", async () => {
    vi.spyOn(authGuard, "authenticateRequest").mockResolvedValue({
      tenantId: "tymz",
      userId: "user_tymz",
      authType: "jwt",
      role: "member",
    });

    const req = new NextRequest("http://localhost:3000/api/v1/bio/tymz", {
      method: "POST",
      body: JSON.stringify({
        displayName: "Tymz Pollack Updated",
        bio: "Updated bio description",
        theme: "cyberpunk",
        links: [],
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ username: "tymz" }) });
    expect(res.status).toBe(200);
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "tymz",
        display_name: "Tymz Pollack Updated",
      }),
      { onConflict: "username" }
    );
  });

  it("returns bio profile on GET", async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: {
        username: "tymz",
        display_name: "Tymz from DB",
        bio: "DB Bio",
        avatar_url: "https://example.com/avatar.png",
        theme_config: { theme: "emerald", links: [] },
      },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/v1/bio/tymz");
    const res = await GET(req, { params: Promise.resolve({ username: "tymz" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.displayName).toBe("Tymz from DB");
  });
});

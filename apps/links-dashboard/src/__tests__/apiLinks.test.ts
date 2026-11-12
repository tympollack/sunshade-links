import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as listLinks, POST as createLink } from "../app/api/v1/links/route";
import { GET as getLink, PATCH as updateLink, DELETE as deleteLink } from "../app/api/v1/links/[id]/route";
import * as authGuard from "../lib/authGuard";
import * as supabaseModule from "../lib/supabase";

describe("Links API Endpoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/v1/links", () => {
    it("returns 401 when unauthorized", async () => {
      const req = new NextRequest("https://links.sunshade.icu/api/v1/links");
      const res = await listLinks(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it("returns paginated links for authenticated tenant", async () => {
      vi.spyOn(authGuard, "authenticateRequest").mockResolvedValue({
        tenantId: "ten_test",
        userId: "usr_test",
        role: "admin",
        authType: "api_key",
      });

      const mockQueryBuilder = {
        schema: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: [{ id: "lnk-1", slug: "promo", destination_url: "https://example.com" }],
          count: 1,
          error: null,
        }),
      };

      vi.spyOn(supabaseModule, "getServiceSupabase").mockReturnValue(mockQueryBuilder as any);

      const req = new NextRequest("https://links.sunshade.icu/api/v1/links?limit=10&offset=0");
      const res = await listLinks(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.pagination.total).toBe(1);
    });
  });

  describe("POST /api/v1/links", () => {
    it("returns 400 on invalid URL in payload", async () => {
      vi.spyOn(authGuard, "authenticateRequest").mockResolvedValue({
        tenantId: "ten_test",
        userId: "usr_test",
        role: "admin",
        authType: "api_key",
      });

      const req = new NextRequest("https://links.sunshade.icu/api/v1/links", {
        method: "POST",
        body: JSON.stringify({
          slug: "bad-url",
          destination_url: "not-a-valid-url",
        }),
      });

      const res = await createLink(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.details.destination_url).toBeDefined();
    });

    it("returns 409 when slug already exists for tenant", async () => {
      vi.spyOn(authGuard, "authenticateRequest").mockResolvedValue({
        tenantId: "ten_test",
        userId: "usr_test",
        role: "admin",
        authType: "api_key",
      });

      const mockQueryBuilder = {
        schema: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: "existing-1", tenant_id: "ten_test" }, error: null }),
      };

      vi.spyOn(supabaseModule, "getServiceSupabase").mockReturnValue(mockQueryBuilder as any);

      const req = new NextRequest("https://links.sunshade.icu/api/v1/links", {
        method: "POST",
        body: JSON.stringify({
          slug: "existing-slug",
          destination_url: "https://example.com/target",
        }),
      });

      const res = await createLink(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain("already exists");
    });

    it("returns 409 when slug is already reserved by another tenant (BUG_0008)", async () => {
      vi.spyOn(authGuard, "authenticateRequest").mockResolvedValue({
        tenantId: "ten_test",
        userId: "usr_test",
        role: "admin",
        authType: "api_key",
      });

      const mockQueryBuilder = {
        schema: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: "existing-1", tenant_id: "ten_other" }, error: null }),
      };

      vi.spyOn(supabaseModule, "getServiceSupabase").mockReturnValue(mockQueryBuilder as any);

      const req = new NextRequest("https://links.sunshade.icu/api/v1/links", {
        method: "POST",
        body: JSON.stringify({
          slug: "shared-slug",
          destination_url: "https://example.com/target",
        }),
      });

      const res = await createLink(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain("already reserved or in use");
    });

    it("rejects non-admin/non-service_role member credentials with 403", async () => {
      vi.spyOn(authGuard, "authenticateRequest").mockResolvedValue({
        tenantId: "ten_test",
        userId: "usr_member",
        role: "member",
        authType: "jwt",
      });

      const req = new NextRequest("https://links.sunshade.icu/api/v1/links", {
        method: "POST",
        body: JSON.stringify({
          slug: "member-forbidden",
          destination_url: "https://example.com",
        }),
      });

      const res = await createLink(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("Forbidden");
    });

    it("creates link successfully (201)", async () => {
      vi.spyOn(authGuard, "authenticateRequest").mockResolvedValue({
        tenantId: "ten_test",
        userId: "usr_test",
        role: "admin",
        authType: "api_key",
      });

      let checkExisting = true;
      const mockQueryBuilder = {
        schema: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (checkExisting) {
            checkExisting = false;
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({
            data: { id: "new-lnk", slug: "new-slug", destination_url: "https://example.com" },
            error: null,
          });
        }),
        insert: vi.fn().mockReturnThis(),
      };

      vi.spyOn(supabaseModule, "getServiceSupabase").mockReturnValue(mockQueryBuilder as any);

      const req = new NextRequest("https://links.sunshade.icu/api/v1/links", {
        method: "POST",
        body: JSON.stringify({
          slug: "new-slug",
          destination_url: "https://example.com",
        }),
      });

      const res = await createLink(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.slug).toBe("new-slug");
    });
  });

  describe("PATCH & DELETE /api/v1/links/[id]", () => {
    it("updates link successfully (200)", async () => {
      vi.spyOn(authGuard, "authenticateRequest").mockResolvedValue({
        tenantId: "ten_test",
        userId: "usr_test",
        role: "admin",
        authType: "api_key",
      });

      const mockQueryBuilder = {
        schema: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "lnk-1", title: "Updated Title" },
          error: null,
        }),
      };

      vi.spyOn(supabaseModule, "getServiceSupabase").mockReturnValue(mockQueryBuilder as any);

      const req = new NextRequest("https://links.sunshade.icu/api/v1/links/lnk-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated Title" }),
      });

      const res = await updateLink(req, { params: Promise.resolve({ id: "lnk-1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.title).toBe("Updated Title");
    });

    it("deletes link successfully (200)", async () => {
      vi.spyOn(authGuard, "authenticateRequest").mockResolvedValue({
        tenantId: "ten_test",
        userId: "usr_test",
        role: "admin",
        authType: "api_key",
      });

      const deleteChain = {
        eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
      };
      const selectChain = {
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { slug: "lnk-1", channel_tag: "direct" } }),
      };
      const mockQueryBuilder = {
        schema: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnValue(selectChain),
        eq: vi.fn().mockReturnValue(deleteChain),
      };

      vi.spyOn(supabaseModule, "getServiceSupabase").mockReturnValue(mockQueryBuilder as any);

      const req = new NextRequest("https://links.sunshade.icu/api/v1/links/lnk-1", {
        method: "DELETE",
      });

      const res = await deleteLink(req, { params: Promise.resolve({ id: "lnk-1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });
});

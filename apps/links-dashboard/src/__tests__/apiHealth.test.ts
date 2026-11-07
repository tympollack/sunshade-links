import { describe, it, expect, vi } from "vitest";
import { GET as healthCheck } from "../app/api/health/route";
import * as supabaseModule from "../lib/supabase";

describe("Health Check API Endpoint", () => {
  it("returns healthy status (200) when dependencies are reachable", async () => {
    const mockQueryBuilder = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: "1" }], error: null }),
    };

    vi.spyOn(supabaseModule, "getServiceSupabase").mockReturnValue(mockQueryBuilder as any);

    const res = await healthCheck();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("healthy");
    expect(json.service).toBe("links-dashboard-api");
    expect(json.checks.database).toBe("ok");
    expect(json.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

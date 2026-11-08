import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as checkTrust } from "../app/api/v1/trust/check/route";

describe("GET /api/v1/trust/check", () => {
  it("returns 400 when url parameter is missing", async () => {
    const req = new NextRequest("https://links.sunshade.icu/api/v1/trust/check");
    const res = await checkTrust(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("evaluates trust score for a secure link", async () => {
    const req = new NextRequest("https://links.sunshade.icu/api/v1/trust/check?url=https%3A%2F%2Fsunshade.icu");
    const res = await checkTrust(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.trustScore).toBeGreaterThanOrEqual(50);
    expect(json.score).toBe(json.trustScore);
    expect(json.pillars).toBeDefined();
  });

  it("penalizes links containing surveillance trackers", async () => {
    const cleanReq = new NextRequest("https://links.sunshade.icu/api/v1/trust/check?url=https%3A%2F%2Fexample.com");
    const cleanRes = await checkTrust(cleanReq);
    const cleanJson = await cleanRes.json();

    const trackedReq = new NextRequest("https://links.sunshade.icu/api/v1/trust/check?url=https%3A%2F%2Fexample.com%3Ffbclid%3D123");
    const trackedRes = await checkTrust(trackedReq);
    const trackedJson = await trackedRes.json();

    expect(trackedJson.trustScore).toBeLessThan(cleanJson.trustScore);
    expect(trackedJson.flags).toContain("SURVEILLANCE_TRACKER_TOKENS_DETECTED");
  });
});

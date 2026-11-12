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

  it("detects and flags phishing indicators on suspicious hosts (SEC_0004)", async () => {
    const phishingReq = new NextRequest("https://links.sunshade.icu/api/v1/trust/check?url=https%3A%2F%2Flogin.paypal.verify-account.badhost.com%2Flogin");
    const phishingRes = await checkTrust(phishingReq);
    const phishingJson = await phishingRes.json();

    expect(phishingJson.flags).toContain("PHISHING_SUSPICION");
    expect(phishingJson.trustScore).toBeLessThan(50);
  });

  it("blocks SSRF attempts on internal/loopback/cloud metadata targets (SEC_0001)", async () => {
    const forbiddenTargets = [
      "http://localhost:3000/api",
      "http://127.0.0.1:8080/internal",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.1/admin",
      "http://192.168.1.1/",
      "http://172.16.0.1/private",
      "http://subdomain.local/secret",
      "http://service.internal/status",
      "ftp://example.com/file",
    ];

    for (const target of forbiddenTargets) {
      const req = new NextRequest(`https://links.sunshade.icu/api/v1/trust/check?url=${encodeURIComponent(target)}`);
      const res = await checkTrust(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    }
  });
});

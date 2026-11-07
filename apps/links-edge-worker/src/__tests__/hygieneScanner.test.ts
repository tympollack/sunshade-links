import { describe, it, expect, vi } from "vitest";
import { scanDestinationHygiene } from "../services/hygieneScanner";

describe("scanDestinationHygiene", () => {
  it("computes full score (25) for fast, direct, clean HTTPS destination", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("<html><body>Safe Website</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    const result = await scanDestinationHygiene("https://example.com/clean", mockFetch as any);

    expect(result.hops).toBe(0);
    expect(result.statusCode).toBe(200);
    expect(result.isHttps).toBe(true);
    expect(result.hygieneScore).toBe(25);
    expect(result.bodySha256).toBeDefined();
    expect(result.bodySha256?.length).toBe(64);
    expect(result.issues).toHaveLength(0);
  });

  it("penalizes redirect hops and non-https endpoints", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: "http://insecure.example.com/step2" },
        })
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://example.com/final" },
        })
      )
      .mockResolvedValueOnce(
        new Response("Final Content", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        })
      );

    const result = await scanDestinationHygiene("https://example.com/start", mockFetch as any);

    expect(result.hops).toBe(2);
    expect(result.finalUrl).toBe("https://example.com/final");
    expect(result.issues).toContain("Non-HTTPS destination or intermediary");
    // hops = 2 => Math.max(0, 10 - 5) = 5. isHttps=true (+10), fast (<800ms) (+5) => 20
    expect(result.hygieneScore).toBeLessThan(25);
  });

  it("yields 0 hygiene score on HTTP 404/500 failures", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("Not Found", {
        status: 404,
      })
    );

    const result = await scanDestinationHygiene("https://example.com/missing", mockFetch as any);

    expect(result.statusCode).toBe(404);
    expect(result.hygieneScore).toBe(0);
    expect(result.issues).toContain("Non-success HTTP status: 404");
  });
});

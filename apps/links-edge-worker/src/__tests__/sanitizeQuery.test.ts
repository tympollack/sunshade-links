import { describe, it, expect } from "vitest";
import { sanitizeDestinationUrl } from "../lib/sanitizeQuery";

describe("sanitizeQuery", () => {
  it("strips invasive surveillance trackers (fbclid, gclid, ttclid)", () => {
    const raw = "https://sunshade.icu/launch?fbclid=IwAR234&gclid=12345&utm_source=meta&utm_medium=cpc";
    const res = sanitizeDestinationUrl(raw);

    expect(res.strippedParams).toContain("fbclid");
    expect(res.strippedParams).toContain("gclid");
    expect(res.cleanUrl).not.toContain("fbclid");
    expect(res.cleanUrl).not.toContain("gclid");
    // Preserves legitimate UTM attribution
    expect(res.cleanUrl).toContain("utm_source=meta");
    expect(res.cleanUrl).toContain("utm_medium=cpc");
    expect(res.privacyScore).toBe(15);
  });

  it("awards full 20/20 privacy score to clean links", () => {
    const clean = "https://sunshade.icu/launch?utm_source=bsky&utm_campaign=launch2026";
    const res = sanitizeDestinationUrl(clean);

    expect(res.strippedParams).toHaveLength(0);
    expect(res.cleanUrl).toBe(clean);
    expect(res.privacyScore).toBe(20);
  });
});

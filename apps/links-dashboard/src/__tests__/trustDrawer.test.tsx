import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrustDrawer } from "../components/trust/TrustDrawer";

describe("TrustDrawer", () => {
  it("renders nothing when isOpen is false", () => {
    const html = renderToStaticMarkup(
      <TrustDrawer
        isOpen={false}
        onClose={() => {}}
        slug="promo"
        destinationUrl="https://example.com"
        trustScore={95}
      />
    );
    expect(html).toBe("");
  });

  it("renders 4-pillar breakdown when open", () => {
    const html = renderToStaticMarkup(
      <TrustDrawer
        isOpen={true}
        onClose={() => {}}
        slug="promo"
        destinationUrl="https://example.com/target"
        trustScore={88}
        pillars={{
          targetHygiene: 25,
          authorProvenance: 30,
          contentIntegrity: 18,
          ecosystemReputation: 15,
        }}
      />
    );

    expect(html).toContain("SunShade Trust Audit");
    expect(html).toContain("88 / 100");
    expect(html).toContain("1. Target Hygiene &amp; SSL");
    expect(html).toContain("2. Author Identity / HTN DID");
    expect(html).toContain("3. Surveillance Cleanliness");
    expect(html).toContain("4. Ecosystem Temporal Retention");
    expect(html).toContain("25 / 25");
    expect(html).toContain("30 / 35");
  });

  it("displays interstitial warning preview link when score < 60", () => {
    const html = renderToStaticMarkup(
      <TrustDrawer
        isOpen={true}
        onClose={() => {}}
        slug="danger"
        destinationUrl="http://untrusted.org"
        trustScore={45}
      />
    );

    expect(html).toContain("Degraded Trust Gate Enforced");
    expect(html).toContain("View Interstitial Warning Gate");
  });
});

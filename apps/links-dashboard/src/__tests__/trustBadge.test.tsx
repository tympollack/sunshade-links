import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrustBadge } from "../components/trust/TrustBadge";

describe("TrustBadge", () => {
  it("renders high trust badge with emerald classes for score >= 80", () => {
    const html = renderToStaticMarkup(<TrustBadge score={95} />);
    expect(html).toContain("95/100");
    expect(html).toContain("text-emerald-400");
  });

  it("renders moderate trust badge with amber classes for score 60-79", () => {
    const html = renderToStaticMarkup(<TrustBadge score={72} />);
    expect(html).toContain("72/100");
    expect(html).toContain("text-amber-400");
  });

  it("renders degraded trust badge with red classes for score < 60", () => {
    const html = renderToStaticMarkup(<TrustBadge score={45} />);
    expect(html).toContain("45/100");
    expect(html).toContain("text-red-400");
  });
});

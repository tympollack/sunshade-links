import { describe, it, expect } from "vitest";
import { formatVanityUrl } from "../components/links/ChannelRow";

describe("formatVanityUrl", () => {
  it("formats direct channel cleanly without subpath", () => {
    expect(formatVanityUrl("launch", "direct")).toBe("https://links.sunshade.icu/launch");
    expect(formatVanityUrl("launch", "")).toBe("https://links.sunshade.icu/launch");
  });

  it("formats specific channels with /channel suffix", () => {
    expect(formatVanityUrl("launch", "bsky")).toBe("https://links.sunshade.icu/launch/bsky");
    expect(formatVanityUrl("launch", "qr")).toBe("https://links.sunshade.icu/launch/qr");
  });

  it("handles custom domain", () => {
    expect(formatVanityUrl("civic-action", "meta", "links.custom.org")).toBe(
      "https://links.custom.org/civic-action/meta"
    );
  });
});

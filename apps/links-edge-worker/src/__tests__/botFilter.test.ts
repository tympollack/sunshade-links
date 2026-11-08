import { describe, it, expect } from "vitest";
import { isBotRequest, getBotIdentifier } from "../lib/botFilter";

describe("botFilter", () => {
  it("detects social media crawlers", () => {
    const discordReq = new Request("https://links.sunshade.icu/launch", {
      headers: { "user-agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)" },
    });
    expect(isBotRequest(discordReq)).toBe(true);
    expect(getBotIdentifier(discordReq)).toBe("discordbot");

    const twitterReq = new Request("https://links.sunshade.icu/launch", {
      headers: { "user-agent": "Twitterbot/1.0" },
    });
    expect(isBotRequest(twitterReq)).toBe(true);

    const whatsappReq = new Request("https://links.sunshade.icu/launch", {
      headers: { "user-agent": "WhatsApp/2.21.12.21 A" },
    });
    expect(isBotRequest(whatsappReq)).toBe(true);
  });

  it("detects headless browser signatures", () => {
    const puppeteerReq = new Request("https://links.sunshade.icu/launch", {
      headers: { "user-agent": "Mozilla/5.0 HeadlessChrome/120.0.0.0 Safari/537.36" },
    });
    expect(isBotRequest(puppeteerReq)).toBe(true);
  });

  it("flags empty or missing User-Agent as bot", () => {
    const emptyReq = new Request("https://links.sunshade.icu/launch");
    expect(isBotRequest(emptyReq)).toBe(true);
  });

  it("permits standard human browsers", () => {
    const chromeReq = new Request("https://links.sunshade.icu/launch", {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });
    expect(isBotRequest(chromeReq)).toBe(false);
  });
});

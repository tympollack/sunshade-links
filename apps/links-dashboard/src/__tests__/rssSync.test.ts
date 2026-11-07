import { describe, it, expect, vi } from "vitest";
import { parseRssXml, wrapFeedLink, fetchRssFeed } from "../lib/rssSync";

describe("wrapFeedLink", () => {
  it("strips surveillance trackers and appends bio_rss channel tag", () => {
    const raw = "https://example.com/post-1?fbclid=track123&utm_source=twitter&keep=val";
    const wrapped = wrapFeedLink(raw, "bio_rss");

    expect(wrapped).toContain("channel=bio_rss");
    expect(wrapped).toContain("utm_source=sunshade_bio");
    expect(wrapped).toContain("keep=val");
    expect(wrapped).not.toContain("fbclid");
  });
});

describe("parseRssXml", () => {
  it("parses RSS 2.0 xml feeds correctly", () => {
    const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Tech Blog</title>
        <item>
          <title><![CDATA[Introducing New Features]]></title>
          <link>https://tech.example.com/posts/new-features</link>
          <pubDate>Mon, 03 Nov 2026 12:00:00 GMT</pubDate>
          <description>Full overview of features released in November.</description>
        </item>
        <item>
          <title>Release 2.0</title>
          <link>https://tech.example.com/posts/v2</link>
          <pubDate>Sun, 02 Nov 2026 09:30:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

    const result = parseRssXml(sampleRss, 5);
    expect(result.error).toBeUndefined();
    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe("Introducing New Features");
    expect(result.items[0].link).toContain("channel=bio_rss");
    expect(result.items[0].description).toBe("Full overview of features released in November.");
    expect(result.items[1].title).toBe("Release 2.0");
  });

  it("parses Atom xml feeds correctly", () => {
    const sampleAtom = `<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Atom Feed</title>
      <entry>
        <title>Atom Entry Title</title>
        <link href="https://example.com/entry-1" />
        <published>2026-11-01T10:00:00Z</published>
        <summary>Summary of Atom entry</summary>
      </entry>
    </feed>`;

    const result = parseRssXml(sampleAtom, 5);
    expect(result.error).toBeUndefined();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Atom Entry Title");
    expect(result.items[0].link).toContain("channel=bio_rss");
  });

  it("returns error for invalid non-feed content", () => {
    const result = parseRssXml("<html><body>Just HTML</body></html>", 5);
    expect(result.items).toHaveLength(0);
    expect(result.error).toBe("No valid RSS or Atom items found in feed");
  });
});

describe("fetchRssFeed", () => {
  it("fetches feed and parses successfully", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        `<rss version="2.0"><channel><item><title>Fetched Post</title><link>https://fetch.com/1</link></item></channel></rss>`,
        { status: 200 }
      )
    );

    const result = await fetchRssFeed("https://test.com/rss", 2, mockFetch as any);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Fetched Post");
  });
});

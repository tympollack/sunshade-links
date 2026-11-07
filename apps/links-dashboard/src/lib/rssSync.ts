/**
 * apps/links-dashboard/src/lib/rssSync.ts
 * Real-Time RSS/Atom Feed Synchronization & Clean Attribution Wrapper
 */

export interface RssFeedItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
}

export interface RssFeedResult {
  title?: string;
  description?: string;
  items: RssFeedItem[];
  error?: string;
}

/**
 * Strips XML tags to get clean text
 */
function stripXmlTags(html: string): string {
  return html.replace(/<[^>]*>?/gm, "").trim();
}

/**
 * Normalizes destination URL with clean attribution tags
 */
export function wrapFeedLink(rawUrl: string, channelTag = "bio_rss"): string {
  try {
    const url = new URL(rawUrl);
    // Strip common tracker tokens
    const trackerParams = ["fbclid", "gclid", "msclkid", "mc_eid", "utm_source", "utm_medium", "utm_campaign"];
    trackerParams.forEach((param) => url.searchParams.delete(param));

    url.searchParams.set("utm_source", "sunshade_bio");
    url.searchParams.set("channel", channelTag);
    return url.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Parses RSS 2.0 and Atom XML feed content into structured items
 */
export function parseRssXml(xmlText: string, maxItems = 5): RssFeedResult {
  const items: RssFeedItem[] = [];

  try {
    // 1. Check for RSS 2.0 <item>
    const itemRegex = /<item[\s\S]*?<\/item>/gi;
    const itemMatches = xmlText.match(itemRegex);

    if (itemMatches && itemMatches.length > 0) {
      for (const itemXml of itemMatches.slice(0, maxItems)) {
        const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
        const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
        const descMatch = itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);

        if (titleMatch && linkMatch) {
          const rawLink = stripXmlTags(linkMatch[1]);
          items.push({
            title: stripXmlTags(titleMatch[1]),
            link: wrapFeedLink(rawLink),
            pubDate: pubDateMatch ? stripXmlTags(pubDateMatch[1]) : undefined,
            description: descMatch ? stripXmlTags(descMatch[1]).slice(0, 160) : undefined,
          });
        }
      }

      return { items };
    }

    // 2. Check for Atom <entry>
    const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
    const entryMatches = xmlText.match(entryRegex);

    if (entryMatches && entryMatches.length > 0) {
      for (const entryXml of entryMatches.slice(0, maxItems)) {
        const titleMatch = entryXml.match(/<title[\s\S]*?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const linkMatch =
          entryXml.match(/<link[^>]*href=["']([^"']+)["']/i) ||
          entryXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
        const publishedMatch =
          entryXml.match(/<published>([\s\S]*?)<\/published>/i) ||
          entryXml.match(/<updated>([\s\S]*?)<\/updated>/i);
        const summaryMatch =
          entryXml.match(/<summary[\s\S]*?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i) ||
          entryXml.match(/<content[\s\S]*?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i);

        if (titleMatch && linkMatch) {
          const rawLink = stripXmlTags(linkMatch[1]);
          items.push({
            title: stripXmlTags(titleMatch[1]),
            link: wrapFeedLink(rawLink),
            pubDate: publishedMatch ? stripXmlTags(publishedMatch[1]) : undefined,
            description: summaryMatch ? stripXmlTags(summaryMatch[1]).slice(0, 160) : undefined,
          });
        }
      }

      return { items };
    }

    return { items: [], error: "No valid RSS or Atom items found in feed" };
  } catch (err: unknown) {
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Fetches and parses an RSS feed from a remote URL
 */
export async function fetchRssFeed(feedUrl: string, maxItems = 5, fetchFn = fetch): Promise<RssFeedResult> {
  try {
    const res = await fetchFn(feedUrl, {
      headers: {
        "User-Agent": "SunShade-RSS-Sync/1.0",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      next: { revalidate: 300 }, // 5 min ISR cache in Next.js
    });

    if (!res.ok) {
      return { items: [], error: `Failed to fetch RSS feed: HTTP ${res.status}` };
    }

    const xml = await res.text();
    return parseRssXml(xml, maxItems);
  } catch (err: unknown) {
    return { items: [], error: `Network error fetching RSS: ${err instanceof Error ? err.message : String(err)}` };
  }
}

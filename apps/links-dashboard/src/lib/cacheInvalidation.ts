/**
 * apps/links-dashboard/src/lib/cacheInvalidation.ts
 * Invalidation service for edge KV caching across dashboard actions (BUG_0006)
 */

export interface CacheInvalidationOptions {
  slug: string;
  channelTag?: string | null;
  hostname?: string;
}

export async function invalidateLinkKvCache(options: CacheInvalidationOptions): Promise<void> {
  const { slug, channelTag, hostname } = options;
  const host = hostname || "links.sunshade.icu";

  // 1. Direct Cloudflare KV binding if running in Worker/Pages context
  const kv = (globalThis as any).LINKS_KV || (process.env as any).LINKS_KV;
  if (kv && typeof kv.delete === "function") {
    try {
      await kv.delete(`slug:${host}:${slug}`);
      await kv.delete(`slug:${host}:${slug}:direct`);
      if (channelTag) {
        await kv.delete(`slug:${host}:${slug}:${channelTag}`);
      }
    } catch {
      // Local binding error ignored
    }
  }

  // 2. HTTP purge call to Edge Worker
  const edgeWorkerUrl =
    process.env.LINKS_EDGE_URL ||
    process.env.NEXT_PUBLIC_LINKS_EDGE_URL ||
    "https://links.sunshade.icu";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.LINKS_API_KEY ||
    "";

  if (edgeWorkerUrl && serviceKey) {
    try {
      await fetch(`${edgeWorkerUrl}/api/cache/purge`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug,
          channelTag: channelTag || undefined,
          hostname: host,
        }),
      });
    } catch {
      // Non-blocking edge invalidation failure
    }
  }
}

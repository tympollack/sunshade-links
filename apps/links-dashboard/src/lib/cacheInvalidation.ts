/**
 * apps/links-dashboard/src/lib/cacheInvalidation.ts
 * Invalidation service for edge KV caching across dashboard actions (BUG_0006, BUG_0002, BUG_0003)
 */

import { getServiceSupabase } from "./supabase";

export interface CacheInvalidationOptions {
  slug: string;
  channelTag?: string | null;
  oldChannelTag?: string | null;
  hostname?: string;
  tenantId?: string;
}

export async function invalidateLinkKvCache(options: CacheInvalidationOptions): Promise<void> {
  const { slug, channelTag, oldChannelTag, hostname, tenantId } = options;

  // Gather all applicable hosts: platform domains + tenant custom domains (BUG_0003)
  const hosts: string[] = [hostname || "links.sunshade.icu"];
  if (!hostname) {
    hosts.push("staging-links.sunshade.icu");
  }

  if (tenantId) {
    try {
      const supabase = getServiceSupabase();
      const { data: domains } = await supabase
        .schema("links" as any)
        .from("custom_domains")
        .select("hostname")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);

      if (domains && Array.isArray(domains)) {
        for (const d of domains) {
          if (d.hostname && !hosts.includes(d.hostname)) {
            hosts.push(d.hostname);
          }
        }
      }
    } catch {
      // Fallback if custom domain table lookup fails
    }
  }

  // 1. Direct Cloudflare KV binding if running in Worker/Pages context
  const kv = (globalThis as any).LINKS_KV || (process.env as any).LINKS_KV;
  if (kv && typeof kv.delete === "function") {
    try {
      for (const host of hosts) {
        await kv.delete(`slug:${host}:${slug}`);
        await kv.delete(`slug:${host}:${slug}:direct`);
        if (channelTag) {
          await kv.delete(`slug:${host}:${slug}:${channelTag}`);
        }
        if (oldChannelTag && oldChannelTag !== channelTag) {
          await kv.delete(`slug:${host}:${slug}:${oldChannelTag}`);
        }
      }
    } catch {
      // Local binding error ignored
    }
  }

  // 2. HTTP purge call to Edge Worker using service role credentials (ANALYSIS_0001)
  const edgeWorkerUrl =
    process.env.LINKS_EDGE_URL ||
    process.env.NEXT_PUBLIC_LINKS_EDGE_URL ||
    "https://links.sunshade.icu";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (edgeWorkerUrl && serviceKey) {
    try {
      const res = await fetch(`${edgeWorkerUrl}/api/cache/purge`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug,
          channelTag: channelTag || undefined,
          oldChannelTag: oldChannelTag || undefined,
          hostnames: hosts,
        }),
      });

      if (!res.ok) {
        console.warn("Edge cache purge returned non-200 status:", res.status);
      }
    } catch (err: unknown) {
      console.warn("Non-blocking edge cache purge failure:", err);
    }
  }
}

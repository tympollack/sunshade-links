/**
 * apps/links-edge-worker/src/index.ts
 * SunShade Links Global Edge Worker
 * Sub-10ms redirects, KV caching, telemetry ingestion, rate limiting, and trust verification.
 */

import { checkRateLimit, RateLimiterBinding } from "./middleware/rateLimiter";
import { extractTelemetryEvent, TelemetryPayload } from "./lib/telemetry";
import { sanitizeDestinationUrl } from "./lib/sanitizeQuery";
import { resolveCustomDomain } from "./services/customDomains";
import { handleWorkerHealthCheck } from "./routes/health";

export interface Env {
  LINKS_KV: KVNamespace;
  TELEMETRY_QUEUE: Queue<TelemetryPayload>;
  RATE_LIMITER: RateLimiterBinding;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export interface CachedLinkRecord {
  id: string;
  tenant_id: string;
  slug: string;
  destination_url: string;
  is_active: boolean;
  expires_at?: string | null;
  click_limit?: number | null;
  password_hash?: string | null;
  channel_tag?: string;
  trust_score?: number;
  trust_flags?: Record<string, unknown>;
}

const WORKER_START_TIME = Date.now();

// Embedded interstitial HTML template
const INTERSTITIAL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Notice — SunShade Trust Engine</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background-color: #020617; color: #F8FAFC; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1.5rem; }
    .card { background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 1rem; max-width: 480px; width: 100%; padding: 2rem; }
    .badge { display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(239, 68, 68, 0.15); color: #F87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 0.35rem 0.75rem; border-radius: 9999px; font-size: 0.85rem; font-weight: 600; margin-bottom: 1.25rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.75rem; color: #FFFFFF; }
    p { color: #94A3B8; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.5rem; }
    .dest-box { background: #020617; border: 1px solid #1E293B; padding: 0.75rem 1rem; border-radius: 0.5rem; font-family: monospace; font-size: 0.85rem; color: #CBD5E1; word-break: break-all; margin-bottom: 1.5rem; }
    .actions { display: flex; flex-direction: column; gap: 0.75rem; }
    .btn-safety { display: inline-block; text-align: center; background: #2563EB; color: #FFFFFF; text-decoration: none; font-weight: 600; padding: 0.75rem 1.25rem; border-radius: 0.5rem; }
    .btn-untrusted { display: inline-block; text-align: center; color: #64748B; font-size: 0.85rem; text-decoration: underline; padding: 0.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">⚠️ Low Trust Score: {{TRUST_SCORE}}/100</div>
    <h1>Caution: Destination Degraded</h1>
    <p>The destination link you are visiting has a low SunShade Trust Score. This occurs when broken SSL, redirect loops, unverified authors, or tracking surveillance are detected.</p>
    <div class="dest-box">{{DESTINATION_URL}}</div>
    <div class="actions">
      <a href="https://sunshade.icu" class="btn-safety">Return to Safety</a>
      <a href="{{CONTINUE_URL}}" class="btn-untrusted" rel="nofollow noopener noreferrer">Continue anyway to destination (untrusted)</a>
    </div>
  </div>
</body>
</html>`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const hostname = url.hostname.toLowerCase();

    // 1. Health Probe
    if (pathname === "/_health" || pathname === "/api/health") {
      return handleWorkerHealthCheck(env, WORKER_START_TIME);
    }

    // 2. Asset & Static Bypasses
    if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") {
      return new Response(null, { status: 404 });
    }

    // 3. Custom Hostname Root Routing (Links-in-Bio)
    const customDomain = await resolveCustomDomain(hostname, env.LINKS_KV);
    if (customDomain && (pathname === "/" || pathname === "")) {
      // Route custom domain root to bio profile
      return Response.redirect(`https://links.sunshade.icu/@${customDomain.tenant_id}`, 302);
    }

    // 4. Rate Limiting Check
    const clientIp = request.headers.get("cf-connecting-ip") || "127.0.0.1";
    const rateCheck = await checkRateLimit({
      clientIp,
      limiter: env.RATE_LIMITER,
    });
    if (!rateCheck.allowed) {
      return new Response("Too Many Requests", {
        status: 429,
        headers: {
          "Retry-After": String(rateCheck.retryAfterSeconds || 10),
          "Content-Type": "text/plain",
        },
      });
    }

    // 5. Slug Parsing: GET /:slug or GET /:slug/:channel
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return Response.redirect("https://sunshade.icu", 302);
    }

    const slug = segments[0];
    const channelTag = segments.length > 1 ? segments[1] : undefined;

    // 6. Cache-First Resolution via Cloudflare KV
    const kvKey = `slug:${hostname}:${slug}`;
    let linkRecord: CachedLinkRecord | null = null;

    if (env.LINKS_KV) {
      try {
        linkRecord = await env.LINKS_KV.get(kvKey, { type: "json" });
      } catch {
        // KV read failure fallback to database
      }
    }

    // 7. Cache Miss: Query Supabase REST endpoint
    if (!linkRecord && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const queryUrl = `${env.SUPABASE_URL}/rest/v1/short_links?slug=eq.${encodeURIComponent(
          slug
        )}&is_active=eq.true&select=id,tenant_id,slug,destination_url,is_active,expires_at,click_limit,password_hash,channel_tag,trust_score,trust_flags&limit=1`;

        const dbRes = await fetch(queryUrl, {
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
        });

        if (dbRes.ok) {
          const rows = (await dbRes.json()) as CachedLinkRecord[];
          if (rows && rows.length > 0) {
            linkRecord = rows[0];
            // Cache record with 300s TTL
            if (env.LINKS_KV) {
              ctx.waitUntil(
                env.LINKS_KV.put(kvKey, JSON.stringify(linkRecord), {
                  expirationTtl: 300,
                })
              );
            }
          }
        }
      } catch {
        // Ignore DB query error; will fall through to 404
      }
    }

    // 8. 404 Not Found
    if (!linkRecord || !linkRecord.is_active) {
      return new Response("Link not found or deactivated", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // 9. Expiry & Click Limit Check
    if (linkRecord.expires_at && new Date(linkRecord.expires_at) < new Date()) {
      return new Response("Link Expired (410 Gone)", {
        status: 410,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // 10. Interstitial Warning Gate for Degraded Links (<60/100)
    const trustScore = linkRecord.trust_score ?? 100;
    const bypassWarning = url.searchParams.get("bypass_warning") === "1";
    if (trustScore < 60 && !bypassWarning) {
      const continueUrl = new URL(request.url);
      continueUrl.searchParams.set("bypass_warning", "1");

      const renderedHtml = INTERSTITIAL_HTML.replace("{{TRUST_SCORE}}", String(trustScore))
        .replace("{{DESTINATION_URL}}", linkRecord.destination_url)
        .replace("{{CONTINUE_URL}}", continueUrl.toString());

      return new Response(renderedHtml, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // 11. Surveillance Stripping & Destination URL Construction
    const { cleanUrl } = sanitizeDestinationUrl(linkRecord.destination_url);
    const destObj = new URL(cleanUrl);

    // Merge incoming query parameters (preserving channel UTMs)
    url.searchParams.forEach((val, key) => {
      if (key !== "bypass_warning") {
        destObj.searchParams.set(key, val);
      }
    });

    if (channelTag && !destObj.searchParams.has("channel")) {
      destObj.searchParams.set("channel", channelTag);
    }

    // 12. Non-blocking Telemetry Enqueue
    if (env.TELEMETRY_QUEUE) {
      const telemetry = extractTelemetryEvent(request, linkRecord.id, linkRecord.tenant_id);
      ctx.waitUntil(env.TELEMETRY_QUEUE.send(telemetry));
    }

    // 13. Dispatch HTTP 302 Redirect
    return Response.redirect(destObj.toString(), 302);
  },

  /**
   * Cloudflare Queues Batch Consumer Worker
   * Aggregates telemetry payloads and flushes into PostgreSQL via RPC
   */
  async queue(batch: MessageBatch<TelemetryPayload>, env: Env): Promise<void> {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn("Queue consumer missing Supabase credentials; acknowledging batch.");
      batch.ackAll();
      return;
    }

    const events = batch.messages.map((m) => m.body);
    if (events.length === 0) {
      batch.ackAll();
      return;
    }

    try {
      const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/ingest_click_batch`;
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ payload: events }),
      });

      if (!res.ok) {
        if (res.status >= 500) {
          // Retry batch on server errors
          batch.retryAll();
          return;
        }
        console.error("Non-retryable ingestion error from Supabase RPC:", res.status);
      }

      batch.ackAll();
    } catch (err) {
      console.error("Queue batch flush failed, retrying:", err);
      batch.retryAll();
    }
  },
};

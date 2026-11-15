/**
 * apps/links-edge-worker/src/index.ts
 * SunShade Links Global Edge Worker
 * Sub-10ms redirects, KV caching, telemetry ingestion, rate limiting, and trust verification.
 */

import { checkRateLimit, RateLimiterBinding } from "./middleware/rateLimiter";
import { extractTelemetryEvent, TelemetryPayload } from "./lib/telemetry";
import { sanitizeDestinationUrl, INVASIVE_TRACKERS } from "./lib/sanitizeQuery";
import { resolveCustomDomain, isCustomDomainHost, CustomDomainConfig } from "./services/customDomains";
import { handleWorkerHealthCheck } from "./routes/health";

export interface Env {
  LINKS_KV: KVNamespace;
  TELEMETRY_QUEUE: Queue<TelemetryPayload>;
  RATE_LIMITER: RateLimiterBinding;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  DASHBOARD_ORIGIN?: string;
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function hashPassword(candidate: string, saltHex?: string): Promise<string> {
  const enc = new TextEncoder();
  if (saltHex) {
    const saltBytes = new Uint8Array(saltHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(candidate),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const derived = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );
    const hashHex = Array.from(new Uint8Array(derived))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `${saltHex}:${hashHex}`;
  }

  const digest = await crypto.subtle.digest("SHA-256", enc.encode(candidate));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPassword(candidate: string, storedHash: string): Promise<boolean> {
  if (storedHash.includes(":")) {
    const [saltHex] = storedHash.split(":");
    const calculated = await hashPassword(candidate, saltHex);
    return calculated === storedHash;
  }
  const rawHash = await hashPassword(candidate);
  return rawHash === storedHash;
}

export async function generateUnlockToken(
  slug: string,
  passwordHash: string,
  secret?: string
): Promise<string> {
  const enc = new TextEncoder();
  // Bind token signature to both server secret and password hash to prevent forgery (SEC_0004)
  const keyMaterial = secret ? `${secret}:${passwordHash}` : passwordHash;
  const keyData = enc.encode(keyMaterial);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const data = enc.encode(`unlock:${slug}:${passwordHash}`);
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyUnlockToken(
  token: string,
  slug: string,
  passwordHash: string,
  secret?: string
): Promise<boolean> {
  if (!token) return false;
  const expected = await generateUnlockToken(slug, passwordHash, secret);
  return token === expected;
}

export function isReservedDashboardRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/links" ||
    pathname.startsWith("/links/") ||
    pathname === "/bio" ||
    pathname.startsWith("/bio/") ||
    pathname.startsWith("/@")
  );
}

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

const PASSWORD_GATE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Protected Link — SunShade</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background-color: #020617; color: #F8FAFC; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1.5rem; }
    .card { background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 1rem; max-width: 440px; width: 100%; padding: 2rem; }
    h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; color: #FFFFFF; }
    p { color: #94A3B8; font-size: 0.875rem; margin-bottom: 1.5rem; line-height: 1.4; }
    input { width: 100%; padding: 0.75rem 1rem; border-radius: 0.5rem; border: 1px solid #334155; background: #020617; color: #FFFFFF; font-size: 0.95rem; margin-bottom: 1rem; }
    button { width: 100%; padding: 0.75rem; border-radius: 0.5rem; background: #F59E0B; color: #020617; font-weight: 600; border: none; cursor: pointer; }
    .error { color: #F87171; font-size: 0.8rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Password Protected</h1>
    <p>This SunShade shortlink is password protected. Enter the passphrase to continue to destination.</p>
    {{ERROR_BLOCK}}
    <form method="POST">
      <input type="password" name="pass" placeholder="Enter password" autofocus required />
      <button type="submit">Unlock & Continue</button>
    </form>
  </div>
</body>
</html>`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const hostname = url.hostname.toLowerCase();

    // 1. Health Probe & Cache Purge Endpoint (BUG_0006)
    if (pathname === "/_health" || pathname === "/api/health") {
      return handleWorkerHealthCheck(env, WORKER_START_TIME);
    }

    if (pathname === "/api/cache/purge" && request.method === "POST") {
      const authHeader = request.headers.get("authorization") || "";
      const expectedToken = env.SUPABASE_SERVICE_ROLE_KEY;
      const parts = authHeader.trim().split(" ");
      const token = parts.length === 2 && parts[0].toLowerCase() === "bearer" ? parts[1].trim() : "";
      // Strict equality comparison to prevent substring bypass (SEC_0003)
      if (!expectedToken || token !== expectedToken) {
        return new Response("Unauthorized", { status: 401 });
      }
      try {
        const body = (await request.json().catch(() => ({}))) as {
          slug?: string;
          hostname?: string;
          hostnames?: string[];
          channelTag?: string;
          oldChannelTag?: string;
          keys?: string[];
        };
        if (env.LINKS_KV) {
          if (body.keys && Array.isArray(body.keys)) {
            await Promise.all(body.keys.map((k) => env.LINKS_KV.delete(k)));
          } else if (body.slug) {
            const hosts = body.hostnames && Array.isArray(body.hostnames) && body.hostnames.length > 0
              ? body.hostnames
              : [body.hostname || hostname];
            const keysToDelete: string[] = [];
            for (const h of hosts) {
              keysToDelete.push(`slug:${h}:${body.slug}`);
              keysToDelete.push(`slug:${h}:${body.slug}:direct`);
              if (body.channelTag) {
                keysToDelete.push(`slug:${h}:${body.slug}:${body.channelTag}`);
              }
              if (body.oldChannelTag) {
                keysToDelete.push(`slug:${h}:${body.slug}:${body.oldChannelTag}`);
              }
            }
            await Promise.all(keysToDelete.map((k) => env.LINKS_KV.delete(k)));
          }
        }
        return new Response(JSON.stringify({ success: true, purged: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ success: false, error: "Purge failed" }), { status: 500 });
      }
    }

    // 2. Asset & Static Bypasses
    if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") {
      return new Response(null, { status: 404 });
    }

    // 3. Custom Hostname Resolution & Isolation (SEC_0002)
    let customDomain: CustomDomainConfig | null = null;
    if (isCustomDomainHost(hostname)) {
      customDomain = await resolveCustomDomain(hostname, env.LINKS_KV);
      if (!customDomain) {
        return new Response("Domain not configured", { status: 404 });
      }
      if (!customDomain.is_active || customDomain.ssl_status !== "active") {
        return new Response("Custom domain is inactive or SSL is pending", { status: 403 });
      }
      if (pathname === "/" || pathname === "") {
        // Route custom domain root to bio profile
        return Response.redirect(`https://links.sunshade.icu/@${customDomain.tenant_id}`, 302);
      }
    }

    // 4. Reserved Dashboard & API Routes (Partition from shortlink resolver - BUG_0002)
    if (isReservedDashboardRoute(pathname)) {
      const dashboardOrigin =
        env.DASHBOARD_ORIGIN ||
        (hostname.startsWith("staging")
          ? "https://staging.sunshade-links-dashboard.pages.dev"
          : "https://sunshade-links-dashboard.pages.dev");
      const originUrl = new URL(request.url);
      const target = new URL(dashboardOrigin);
      originUrl.protocol = target.protocol;
      originUrl.host = target.host;
      originUrl.port = target.port;
      return fetch(new Request(originUrl.toString(), request));
    }

    // 5. Rate Limiting Check
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

    // 6. Slug Parsing: GET /:slug or GET /:slug/:channel
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return Response.redirect("https://sunshade.icu", 302);
    }

    const slug = segments[0];
    const channelTag = segments.length > 1 ? segments[1] : undefined;

    // 7. Cache-First Resolution via Cloudflare KV (BUG_0004)
    const kvChannelKey = channelTag ? `slug:${hostname}:${slug}:${channelTag}` : `slug:${hostname}:${slug}`;
    const kvDefaultKey = `slug:${hostname}:${slug}`;
    let linkRecord: CachedLinkRecord | null = null;

    if (env.LINKS_KV) {
      try {
        if (channelTag) {
          linkRecord = await env.LINKS_KV.get(kvChannelKey, { type: "json" });
        } else {
          linkRecord = await env.LINKS_KV.get(kvDefaultKey, { type: "json" });
        }
      } catch {
        // KV read failure fallback to database
      }
    }

    // Enforce tenant isolation on custom domains
    if (customDomain && linkRecord && linkRecord.tenant_id !== customDomain.tenant_id) {
      linkRecord = null;
    }

    // 8. Cache Miss: Query Supabase REST endpoint (BUG_0003, BUG_0004, ANALYSIS_0001, SEC_0002)
    if (!linkRecord && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        let queryUrl = `${env.SUPABASE_URL}/rest/v1/short_links?slug=eq.${encodeURIComponent(
          slug
        )}&is_active=eq.true&select=id,tenant_id,slug,destination_url,is_active,expires_at,click_limit,password_hash,channel_tag,trust_score,trust_flags&limit=1`;

        if (customDomain) {
          queryUrl += `&tenant_id=eq.${encodeURIComponent(customDomain.tenant_id)}`;
        }

        if (channelTag) {
          queryUrl += `&channel_tag=eq.${encodeURIComponent(channelTag)}`;
        } else {
          queryUrl += `&or=(channel_tag.eq.direct,channel_tag.is.null)`;
        }

        const dbRes = await fetch(queryUrl, {
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Accept-Profile": "links",
          },
        });

        if (dbRes.ok) {
          const rows = (await dbRes.json()) as CachedLinkRecord[];
          if (rows && rows.length > 0) {
            linkRecord = rows[0];
            if (env.LINKS_KV) {
              ctx.waitUntil(
                env.LINKS_KV.put(channelTag ? kvChannelKey : kvDefaultKey, JSON.stringify(linkRecord), {
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

    // Double-check custom domain isolation
    if (customDomain && linkRecord && linkRecord.tenant_id !== customDomain.tenant_id) {
      linkRecord = null;
    }

    // 9. 404 Not Found & Public Bio Fallback (BUG_0002)
    if (!linkRecord || !linkRecord.is_active) {
      if (!linkRecord && segments.length === 1 && !slug.startsWith("@")) {
        // Route non-shortlink vanity path to canonical bio route /@slug
        return Response.redirect(`${url.origin}/@${slug}`, 302);
      }
      return new Response("Link not found or deactivated", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // 10. Expiry & Click Limit Check (BUG_0007, BUG_0001, BUG_0004)
    if (linkRecord.expires_at && new Date(linkRecord.expires_at) < new Date()) {
      return new Response("Link Expired (410 Gone)", {
        status: 410,
        headers: { "Content-Type": "text/plain" },
      });
    }

    if (linkRecord.click_limit != null && linkRecord.click_limit > 0) {
      const clickCountKey = `clicks:${linkRecord.id}`;
      let currentClicks = 0;
      if (env.LINKS_KV) {
        try {
          const countStr = await env.LINKS_KV.get(clickCountKey);
          currentClicks = countStr ? parseInt(countStr, 10) : 0;
        } catch (kvErr) {
          console.warn("KV counter read failure for click limit check:", kvErr);
          currentClicks = 0;
        }
      }
      if (currentClicks >= linkRecord.click_limit) {
        return new Response("Link Click Limit Exceeded (410 Gone)", {
          status: 410,
          headers: { "Content-Type": "text/plain" },
        });
      }
      // Atomically reserve the click count in KV before redirecting (BUG_0001)
      if (env.LINKS_KV) {
        try {
          await env.LINKS_KV.put(clickCountKey, String(currentClicks + 1));
        } catch (kvPutErr) {
          console.warn("KV counter update failure:", kvPutErr);
        }
      }
    }

    // 11. Password Challenge Gate (SEC_0001, SEC_0003 & SEC_0004)
    let unlockedViaPost = false;
    if (linkRecord.password_hash) {
      const cookieHeader = request.headers.get("cookie") || "";
      const cookieMatch = cookieHeader.match(new RegExp(`(?:^|; )sunshade_unlocked_${slug}=([^;]+)`));
      const cookieToken = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
      const isUnlockedCookie = cookieToken
        ? await verifyUnlockToken(cookieToken, slug, linkRecord.password_hash, env.SUPABASE_SERVICE_ROLE_KEY)
        : false;

      let candidate: string | null = null;
      if (request.method === "POST") {
        try {
          const contentType = request.headers.get("content-type") || "";
          if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            candidate = (formData.get("pass") || formData.get("password")) as string | null;
          } else if (contentType.includes("application/json")) {
            const json = (await request.json().catch(() => ({}))) as any;
            candidate = json?.pass || json?.password;
          }
        } catch {
          // ignore parsing error
        }
      } else {
        candidate =
          url.searchParams.get("pass") ||
          url.searchParams.get("password") ||
          request.headers.get("x-link-password");
      }

      let authorized = isUnlockedCookie;
      if (!authorized && candidate) {
        // Enforce Password Challenge Rate Limiter Tier 1 (5 attempts/min per IP) (SEC_0003)
        const pwRateCheck = await checkRateLimit({
          clientIp,
          limiter: env.RATE_LIMITER,
          isPasswordChallenge: true,
        });
        if (!pwRateCheck.allowed) {
          return new Response("Too Many Password Attempts. Locked out for 15 minutes.", {
            status: 429,
            headers: {
              "Retry-After": String(pwRateCheck.retryAfterSeconds || 900),
              "Content-Type": "text/plain",
            },
          });
        }

        authorized = await verifyPassword(candidate, linkRecord.password_hash);
        if (authorized && request.method === "POST") {
          unlockedViaPost = true;
        }
      }

      if (!authorized) {
        const errorBlock = ((request.method === "POST" || candidate) && !authorized)
          ? `<div class="error">Incorrect password. Please try again.</div>`
          : "";
        const promptHtml = PASSWORD_GATE_HTML.replace("{{ERROR_BLOCK}}", errorBlock);
        return new Response(promptHtml, {
          status: 401,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    }

    // 12. Interstitial Warning Gate for Degraded Links (<60/100) (SEC_0005)
    const trustScore = linkRecord.trust_score ?? 100;
    const bypassWarning = url.searchParams.get("bypass_warning") === "1";
    if (trustScore < 60 && !bypassWarning) {
      const continueUrl = new URL(request.url);
      continueUrl.searchParams.set("bypass_warning", "1");
      // Clean password parameters from continueUrl to prevent URL disclosure
      continueUrl.searchParams.delete("pass");
      continueUrl.searchParams.delete("password");

      const renderedHtml = INTERSTITIAL_HTML.replace("{{TRUST_SCORE}}", escapeHtml(String(trustScore)))
        .replace("{{DESTINATION_URL}}", escapeHtml(linkRecord.destination_url))
        .replace("{{CONTINUE_URL}}", escapeHtml(continueUrl.toString()));

      const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
      if (unlockedViaPost) {
        const unlockToken = await generateUnlockToken(
          slug,
          linkRecord.password_hash!,
          env.SUPABASE_SERVICE_ROLE_KEY
        );
        headers.set(
          "Set-Cookie",
          `sunshade_unlocked_${slug}=${unlockToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`
        );
      }

      return new Response(renderedHtml, {
        status: 200,
        headers,
      });
    }

    // 13. Surveillance Stripping & Destination URL Construction (SEC_0006)
    const { cleanUrl } = sanitizeDestinationUrl(linkRecord.destination_url);
    const destObj = new URL(cleanUrl);

    // Merge incoming query parameters while purging surveillance trackers and internal params
    url.searchParams.forEach((val, key) => {
      const lower = key.toLowerCase();
      if (
        key !== "bypass_warning" &&
        key !== "pass" &&
        key !== "password" &&
        !INVASIVE_TRACKERS.has(lower)
      ) {
        destObj.searchParams.set(key, val);
      }
    });

    if (channelTag && !destObj.searchParams.has("channel")) {
      destObj.searchParams.set("channel", channelTag);
    }

    // 14. Non-blocking Telemetry Enqueue
    if (env.TELEMETRY_QUEUE) {
      const telemetry = extractTelemetryEvent(request, linkRecord.id, linkRecord.tenant_id);
      ctx.waitUntil(env.TELEMETRY_QUEUE.send(telemetry));
    }

    // 15. Dispatch HTTP 302/303 Redirect
    const redirectHeaders = new Headers();
    redirectHeaders.set("Location", destObj.toString());
    if (unlockedViaPost) {
      const unlockToken = await generateUnlockToken(
        slug,
        linkRecord.password_hash!,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      redirectHeaders.set(
        "Set-Cookie",
        `sunshade_unlocked_${slug}=${unlockToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`
      );
    }

    return new Response(null, {
      status: request.method === "POST" ? 303 : 302,
      headers: redirectHeaders,
    });
  },

  /**
   * Cloudflare Queues Batch Consumer Worker
   * Aggregates telemetry payloads and flushes into PostgreSQL via RPC
   */
  async queue(batch: MessageBatch<TelemetryPayload>, env: Env): Promise<void> {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn("Queue consumer missing Supabase credentials; retrying batch.");
      batch.retryAll();
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
          "Content-Profile": "links",
          "Accept-Profile": "links",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ payload: events }),
      });

      if (!res.ok) {
        console.error(`Telemetry ingestion RPC failed with status ${res.status}`);
        batch.retryAll();
        return;
      }

      batch.ackAll();
    } catch (err) {
      console.error("Queue batch flush failed, retrying:", err);
      batch.retryAll();
    }
  },
};

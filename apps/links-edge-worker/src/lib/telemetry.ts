/**
 * apps/links-edge-worker/src/lib/telemetry.ts
 * Coarse Geo & Device Context Telemetry Extractor (Privacy Guardrails: Zero PII, No raw IP)
 */

import { isBotRequest } from "./botFilter";

export interface TelemetryPayload {
  link_id: string;
  tenant_id: string;
  country_code: string;
  city: string | null;
  continent: string | null;
  device_type: "mobile" | "desktop" | "tablet" | "bot";
  os: string;
  browser: string;
  referrer_domain: string;
  is_bot: boolean;
  clicked_at: string;
}

/**
 * Normalizes incoming referrers to high-level domain
 */
export function normalizeReferrer(referrerHeader: string | null): string {
  if (!referrerHeader) return "direct";
  try {
    const parsed = new URL(referrerHeader);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);

    // Common app schemes & redirects
    if (referrerHeader.startsWith("android-app://com.linkedin.android") || host.includes("linkedin")) {
      return "linkedin.com";
    }
    if (referrerHeader.startsWith("android-app://com.twitter.android") || host === "t.co" || host.includes("x.com")) {
      return "x.com";
    }
    if (host.includes("bsky.app") || host.includes("bluesky")) {
      return "bsky.app";
    }
    if (host.includes("facebook.com") || host === "fb.me") {
      return "facebook.com";
    }
    if (host.includes("instagram.com")) {
      return "instagram.com";
    }

    return host;
  } catch {
    return "direct";
  }
}

/**
 * Parses Device, OS, and Browser from User-Agent and Client Hints without PII
 */
export function parseDeviceContext(request: Request): {
  device_type: "mobile" | "desktop" | "tablet" | "bot";
  os: string;
  browser: string;
} {
  const ua = request.headers.get("user-agent") || "";
  const chMobile = request.headers.get("sec-ch-ua-mobile");

  if (isBotRequest(request)) {
    return { device_type: "bot", os: "Unknown", browser: "Bot/Crawler" };
  }

  // Device Classification
  let device_type: "mobile" | "desktop" | "tablet" | "bot" = "desktop";
  if (chMobile === "?1" || /iphone|ipod|android.*mobile|windows phone/i.test(ua)) {
    device_type = "mobile";
  } else if (/ipad|tablet|android(?!.*mobile)/i.test(ua)) {
    device_type = "tablet";
  }

  // OS Classification
  let os = "Other";
  if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
  else if (/windows nt/i.test(ua)) os = "Windows";
  else if (/linux/i.test(ua)) os = "Linux";

  // Browser Classification
  let browser = "Other";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome|crios/i.test(ua) && !/edg\//i.test(ua)) browser = "Chrome";
  else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = "Safari";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";

  return { device_type, os, browser };
}

/**
 * Extracts privacy-compliant telemetry event
 */
export function extractTelemetryEvent(
  request: Request,
  linkId: string,
  tenantId: string
): TelemetryPayload {
  const cf = (request as any).cf || {};
  const { device_type, os, browser } = parseDeviceContext(request);
  const is_bot = isBotRequest(request) || device_type === "bot";

  return {
    link_id: linkId,
    tenant_id: tenantId,
    country_code: cf.country || "UNKNOWN",
    city: cf.city || null,
    continent: cf.continent || null,
    device_type,
    os,
    browser,
    referrer_domain: normalizeReferrer(request.headers.get("referer")),
    is_bot,
    clicked_at: new Date().toISOString(),
  };
}

import { NextRequest, NextResponse } from "next/server";
import { evaluateLinkTrust } from "@sunshade/htn-trust-engine";

const INVASIVE_TRACKERS = new Set([
  "fbclid",
  "gclid",
  "msclkid",
  "ttclid",
  "twclid",
  "_hsenc",
  "mc_eid",
  "sc_campaign",
  "igshid",
  "wickedid",
  "yclid",
]);

export function isPrivateOrInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();

  // Strip brackets from IPv6 hostnames
  const cleanHost = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

  if (
    cleanHost === "localhost" ||
    cleanHost.endsWith(".localhost") ||
    cleanHost.endsWith(".local") ||
    cleanHost.endsWith(".internal") ||
    cleanHost.endsWith(".arpa")
  ) {
    return true;
  }

  // IPv4 check
  const ipv4Match = cleanHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = [
      parseInt(ipv4Match[1], 10),
      parseInt(ipv4Match[2], 10),
      parseInt(ipv4Match[3], 10),
      parseInt(ipv4Match[4], 10),
    ];
    if (octets.some((o) => o < 0 || o > 255)) {
      return true; // Malformed IP
    }

    // 0.0.0.0/8
    if (octets[0] === 0) return true;
    // 127.0.0.0/8 (Loopback)
    if (octets[0] === 127) return true;
    // 10.0.0.0/8 (Private)
    if (octets[0] === 10) return true;
    // 172.16.0.0/12 (Private)
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (octets[0] === 192 && octets[1] === 168) return true;
    // 169.254.0.0/16 (Link-local / Cloud Metadata)
    if (octets[0] === 169 && octets[1] === 254) return true;
  }

  // IPv6 check
  if (
    cleanHost === "::1" ||
    cleanHost === "::" ||
    cleanHost.startsWith("fe80:") ||
    cleanHost.startsWith("fc") ||
    cleanHost.startsWith("fd") ||
    cleanHost.startsWith("::ffff:")
  ) {
    return true;
  }

  return false;
}

export function detectPhishingIndicators(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  // 1. Raw IPv4 / IPv6 addresses used as hostnames
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith("[") || /^[0-9a-f:]+$/.test(host)) {
    return true;
  }
  // 2. Punycode / IDN homograph attacks
  if (host.includes("xn--")) {
    return true;
  }
  // 3. Excessive subdomain nesting (e.g. login.paypal.com.evil.com)
  const parts = host.split(".");
  if (parts.length > 4) {
    return true;
  }
  // 4. Phishing keywords combined with suspicious subdomains
  const suspiciousKeywords = ["login", "signin", "verify", "secure", "account", "update", "banking", "wallet", "recovery"];
  if (parts.length > 2) {
    const subdomain = parts.slice(0, -2).join("-");
    if (suspiciousKeywords.some((kw) => subdomain.includes(kw))) {
      return true;
    }
  }
  return false;
}

export async function GET(request: NextRequest) {
  try {
    const urlParam = request.nextUrl.searchParams.get("url");
    if (!urlParam) {
      return NextResponse.json(
        { success: false, error: "Missing required 'url' query parameter" },
        { status: 400 }
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlParam);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid URL provided" },
        { status: 400 }
      );
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { success: false, error: "Only http and https protocols are supported" },
        { status: 400 }
      );
    }

    // SSRF Guard: reject private IP ranges, loopback, and internal metadata targets (SEC_0001)
    if (isPrivateOrInternalHost(parsedUrl.hostname)) {
      return NextResponse.json(
        { success: false, error: "Target host is not permitted for inspection" },
        { status: 400 }
      );
    }

    const isHttps = parsedUrl.protocol === "https:";
    let hasSurveillanceTokens = false;
    for (const key of parsedUrl.searchParams.keys()) {
      if (INVASIVE_TRACKERS.has(key.toLowerCase())) {
        hasSurveillanceTokens = true;
        break;
      }
    }

    const hasPhishingIndicators = detectPhishingIndicators(parsedUrl);

    // Active inspection probe (measures latency and detects redirect hops) - SEC_0004, SEC_0001
    let redirectHops = 1;
    let responseTimeMs = 250;
    try {
      const probeStart = Date.now();
      const probeRes = await fetch(urlParam, {
        method: "HEAD",
        signal: AbortSignal.timeout(2000),
        headers: { "User-Agent": "SunShade-TrustEngine/1.0" },
        redirect: "manual",
      });
      responseTimeMs = Math.max(1, Date.now() - probeStart);
      if (probeRes.redirected || (probeRes.status >= 300 && probeRes.status < 400)) {
        redirectHops = 2;
      }
    } catch {
      // Degraded / unreachable target fallback
      responseTimeMs = 1200;
      redirectHops = 2;
    }

    const evaluation = evaluateLinkTrust({
      destinationUrl: urlParam,
      isHttps,
      redirectHops,
      responseTimeMs,
      hasSurveillanceTokens,
      hasPhishingIndicators,
    });

    return NextResponse.json({
      success: true,
      url: urlParam,
      trustScore: evaluation.totalScore,
      score: evaluation.totalScore,
      tier: evaluation.tier,
      pillars: evaluation.pillars,
      flags: evaluation.flags,
      interstitialRequired: evaluation.interstitialRequired,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

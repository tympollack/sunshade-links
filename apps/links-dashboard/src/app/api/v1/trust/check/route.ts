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

    const isHttps = parsedUrl.protocol === "https:";
    let hasSurveillanceTokens = false;
    for (const key of parsedUrl.searchParams.keys()) {
      if (INVASIVE_TRACKERS.has(key.toLowerCase())) {
        hasSurveillanceTokens = true;
        break;
      }
    }

    const hasPhishingIndicators = detectPhishingIndicators(parsedUrl);

    // Active inspection probe (measures latency and detects redirect hops) - SEC_0004
    let redirectHops = 1;
    let responseTimeMs = 250;
    try {
      const probeStart = Date.now();
      const probeRes = await fetch(urlParam, {
        method: "HEAD",
        signal: AbortSignal.timeout(2000),
        headers: { "User-Agent": "SunShade-TrustEngine/1.0" },
      });
      responseTimeMs = Math.max(1, Date.now() - probeStart);
      if (probeRes.redirected) {
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

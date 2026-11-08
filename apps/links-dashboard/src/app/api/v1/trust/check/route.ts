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

    const evaluation = evaluateLinkTrust({
      destinationUrl: urlParam,
      isHttps,
      redirectHops: 1,
      responseTimeMs: 250,
      hasSurveillanceTokens,
      hasPhishingIndicators: false,
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

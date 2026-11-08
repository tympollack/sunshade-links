import { validateDidFormat, verifyEd25519Signature } from "./did";
import { calculateDecayedScore } from "./decay";

export interface PillarBreakdown {
  targetHygiene: number; // Max 25
  authorProvenance: number; // Max 35
  contentIntegrity: number; // Max 20
  ecosystemReputation: number; // Max 20
}

export interface TrustEvaluationInput {
  destinationUrl: string;
  isHttps: boolean;
  redirectHops: number;
  responseTimeMs: number;
  authorDid?: string;
  signatureHex?: string;
  publicKeyHex?: string;
  authorAgeDays?: number;
  hasSurveillanceTokens: boolean;
  hasPhishingIndicators?: boolean;
  baselineReputation?: number; // 0 - 20
  lastVerifiedAt?: string | Date;
  abuseReportCount?: number;
}

export interface TrustEvaluationResult {
  totalScore: number; // 0 - 100
  tier: "high" | "moderate" | "degraded";
  pillars: PillarBreakdown;
  flags: string[];
  interstitialRequired: boolean;
}

/**
 * Evaluates comprehensive 4-pillar trust score
 */
export function evaluateLinkTrust(input: TrustEvaluationInput): TrustEvaluationResult {
  const flags: string[] = [];

  // Pillar 1: Target Hygiene (Max 25 pts)
  let targetHygiene = 0;
  if (input.isHttps) {
    targetHygiene += 10;
  } else {
    flags.push("INSECURE_HTTP_PROTOCOL");
  }

  if (input.redirectHops <= 1) {
    targetHygiene += 10;
  } else {
    targetHygiene += Math.max(0, 10 - (input.redirectHops - 1) * 4);
    flags.push(`MULTIPLE_REDIRECT_HOPS_${input.redirectHops}`);
  }

  if (input.responseTimeMs < 800) {
    targetHygiene += 5;
  }

  // Pillar 2: Author Identity / HTN Provenance (Max 35 pts)
  let authorProvenance = 0;
  if (input.authorDid && validateDidFormat(input.authorDid)) {
    authorProvenance += 10;

    if (input.signatureHex && input.publicKeyHex) {
      const validSig = verifyEd25519Signature(input.destinationUrl, input.signatureHex, input.publicKeyHex);
      if (validSig) {
        authorProvenance += 20;
      } else {
        flags.push("INVALID_HTN_SIGNATURE");
      }
    }

    if ((input.authorAgeDays || 0) >= 30) {
      authorProvenance += 5;
    }
  } else {
    flags.push("UNVERIFIED_AUTHOR_DID");
  }

  // Pillar 3: Content Integrity & Cleanliness (Max 20 pts)
  let contentIntegrity = 0;
  if (!input.hasSurveillanceTokens) {
    contentIntegrity += 10;
  } else {
    flags.push("SURVEILLANCE_TRACKER_TOKENS_DETECTED");
  }

  if (!input.hasPhishingIndicators) {
    contentIntegrity += 10;
  } else {
    flags.push("PHISHING_SUSPICION");
  }

  // Pillar 4: Ecosystem Reputation & Temporal Decay (Max 20 pts)
  const rawReputation = input.baselineReputation !== undefined ? input.baselineReputation : 18;
  let ecosystemReputation = rawReputation;

  if (input.lastVerifiedAt) {
    const decayed = calculateDecayedScore({
      initialScore: rawReputation * 5, // scaled to 100
      lastVerifiedAt: input.lastVerifiedAt,
      abuseReportCount: input.abuseReportCount || 0,
    });
    ecosystemReputation = Math.round((decayed / 100) * 20);
  }

  if ((input.abuseReportCount || 0) > 0) {
    flags.push(`ABUSE_REPORTS_RECORDED_${input.abuseReportCount}`);
  }

  const pillars: PillarBreakdown = {
    targetHygiene: Math.min(25, targetHygiene),
    authorProvenance: Math.min(35, authorProvenance),
    contentIntegrity: Math.min(20, contentIntegrity),
    ecosystemReputation: Math.max(0, Math.min(20, ecosystemReputation)),
  };

  const totalScore = Math.max(0, Math.min(100, pillars.targetHygiene + pillars.authorProvenance + pillars.contentIntegrity + pillars.ecosystemReputation));

  let tier: "high" | "moderate" | "degraded" = "high";
  if (totalScore < 60) {
    tier = "degraded";
  } else if (totalScore < 80) {
    tier = "moderate";
  }

  return {
    totalScore,
    tier,
    pillars,
    flags,
    interstitialRequired: totalScore < 60,
  };
}

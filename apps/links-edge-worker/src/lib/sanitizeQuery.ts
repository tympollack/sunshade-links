/**
 * apps/links-edge-worker/src/lib/sanitizeQuery.ts
 * Surveillance Token Stripping & Clean Attribution Pipeline
 */

export const INVASIVE_TRACKERS = new Set([
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

export const PRESERVED_ATTRIBUTION = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ch",
  "channel",
  "ref",
]);

export interface SanitizationResult {
  cleanUrl: string;
  strippedParams: string[];
  privacyScore: number; // 0 - 20 (Privacy Pillar)
}

/**
 * Strips invasive surveillance query parameters while preserving clean attribution UTM tags
 */
export function sanitizeDestinationUrl(rawUrl: string): SanitizationResult {
  try {
    const url = new URL(rawUrl);
    const strippedParams: string[] = [];

    const keysToDelete: string[] = [];
    url.searchParams.forEach((_, key) => {
      const lowerKey = key.toLowerCase();
      if (INVASIVE_TRACKERS.has(lowerKey)) {
        keysToDelete.push(key);
      }
    });

    for (const key of keysToDelete) {
      strippedParams.push(key);
      url.searchParams.delete(key);
    }

    // Privacy Scoring (Pillar: 20%)
    // Max 20 points: Links with zero trackers receive 20.
    // If surveillance tokens were present and purged, score is adjusted to 15.
    // If raw destination has surveillance tokens and cannot be sanitized, score drops to 5.
    let privacyScore = 20;
    if (strippedParams.length > 0) {
      privacyScore = 15;
    }

    return {
      cleanUrl: url.toString(),
      strippedParams,
      privacyScore,
    };
  } catch {
    return {
      cleanUrl: rawUrl,
      strippedParams: [],
      privacyScore: 5,
    };
  }
}

/**
 * apps/links-edge-worker/src/services/hygieneScanner.ts
 * Destination Hygiene, Redirect-Chain, and Script Scanner (Target Hygiene: 25%)
 */

export interface HygieneScanResult {
  destinationUrl: string;
  finalUrl: string;
  hops: number;
  statusCode: number;
  isHttps: boolean;
  responseTimeMs: number;
  bodySha256?: string;
  hygieneScore: number; // 0 - 25
  issues: string[];
}

/**
 * Computes SHA-256 hash in Web Crypto API
 */
async function computeHash(text: string): Promise<string> {
  const enc = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", enc.encode(text));
  const hashArray = Array.from(new Uint8Array(buffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Executes destination hygiene scan following up to 5 redirect hops
 */
export async function scanDestinationHygiene(
  targetUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<HygieneScanResult> {
  let currentUrl = targetUrl;
  let hops = 0;
  const issues: string[] = [];
  const startTime = Date.now();
  let statusCode = 0;
  let bodySha256 = "";

  try {
    while (hops < 5) {
      const urlObj = new URL(currentUrl);
      if (urlObj.protocol !== "https:") {
        issues.push("Non-HTTPS destination or intermediary");
      }

      const res = await fetchFn(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "SunShade-Trust-Scanner/1.0",
        },
      });

      statusCode = res.status;

      if ([301, 302, 307, 308].includes(statusCode)) {
        hops++;
        const location = res.headers.get("location");
        if (!location) {
          issues.push("Missing redirect location header");
          break;
        }
        currentUrl = new URL(location, currentUrl).toString();
      } else {
        // Destination reached
        const text = await res.text();
        bodySha256 = await computeHash(text);
        break;
      }
    }
  } catch (err: unknown) {
    issues.push(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return {
      destinationUrl: targetUrl,
      finalUrl: currentUrl,
      hops,
      statusCode: 0,
      isHttps: false,
      responseTimeMs: Date.now() - startTime,
      hygieneScore: 0,
      issues,
    };
  }

  const responseTimeMs = Date.now() - startTime;
  const finalUrlObj = new URL(currentUrl);
  const isHttps = finalUrlObj.protocol === "https:";

  // Scoring Breakdown (Target Hygiene Pillar: 25% max)
  let hygieneScore = 0;
  if (isHttps) hygieneScore += 10;
  if (hops <= 1) hygieneScore += 10;
  else hygieneScore += Math.max(0, 10 - (hops - 1) * 5); // Penalty per hop
  if (responseTimeMs < 800) hygieneScore += 5;

  if (statusCode >= 400 || statusCode === 0) {
    hygieneScore = 0;
    issues.push(`Non-success HTTP status: ${statusCode}`);
  }

  return {
    destinationUrl: targetUrl,
    finalUrl: currentUrl,
    hops,
    statusCode,
    isHttps,
    responseTimeMs,
    bodySha256,
    hygieneScore,
    issues,
  };
}

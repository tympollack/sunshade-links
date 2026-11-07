/**
 * apps/links-edge-worker/src/middleware/rateLimiter.ts
 * Multi-Tier Edge Rate-Limiting, IP Abuse Shields, & DDoS Mitigation
 */

export interface RateLimiterBinding {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
}

export interface RateLimitOptions {
  clientIp: string;
  limiter?: RateLimiterBinding;
  isPasswordChallenge?: boolean;
  apiKey?: string | null;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: string;
}

// In-memory local sliding window counter for dev/fallback
const localBuckets = new Map<string, { count: number; resetAt: number }>();

function checkLocalWindow(key: string, limit: number, windowSec: number): boolean {
  const now = Date.now();
  const bucket = localBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    localBuckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return true;
  }
  if (bucket.count >= limit) {
    return false;
  }
  bucket.count++;
  return true;
}

/**
 * Checks rate limits across tiers (Public Redirects, Password Gate, API key)
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitCheckResult> {
  const { clientIp, limiter, isPasswordChallenge, apiKey } = options;

  // Tier 1: Password Gate Challenge (Max 5 attempts / min)
  if (isPasswordChallenge) {
    const key = `pw:${clientIp}`;
    const allowed = checkLocalWindow(key, 5, 60);
    if (!allowed) {
      return { allowed: false, retryAfterSeconds: 900, reason: "Too many password attempts" };
    }
    return { allowed: true };
  }

  // Tier 2: Tenant API Key (Max 60 req / min)
  if (apiKey) {
    const key = `api:${apiKey}`;
    const allowed = checkLocalWindow(key, 60, 60);
    if (!allowed) {
      return { allowed: false, retryAfterSeconds: 60, reason: "API key rate limit exceeded" };
    }
    return { allowed: true };
  }

  // Tier 3: Public Redirects (Max 100 req per 10s per IP)
  if (limiter && typeof limiter.limit === "function") {
    try {
      const { success } = await limiter.limit({ key: `redirect:${clientIp}` });
      if (!success) {
        return { allowed: false, retryAfterSeconds: 10, reason: "Redirect rate limit exceeded" };
      }
      return { allowed: true };
    } catch {
      // Fallback to local window if Cloudflare binding is unavailable in dev/test
    }
  }

  const allowed = checkLocalWindow(`redirect:${clientIp}`, 100, 10);
  if (!allowed) {
    return { allowed: false, retryAfterSeconds: 10, reason: "Redirect rate limit exceeded" };
  }

  return { allowed: true };
}

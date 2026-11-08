/**
 * packages/htn-trust-engine/src/decay.ts
 * Temporal Trust Decay & Activity Reinforcement Model
 */

export interface DecayOptions {
  initialScore: number;
  lastVerifiedAt: string | Date;
  decayRatePerDay?: number; // Lambda, default 0.005
  verifiedActivityCount?: number;
  abuseReportCount?: number;
  now?: Date;
}

/**
 * Calculates time-decayed trust score with activity reinforcement and abuse penalty
 */
export function calculateDecayedScore(options: DecayOptions): number {
  const {
    initialScore,
    lastVerifiedAt,
    decayRatePerDay = 0.005,
    verifiedActivityCount = 0,
    abuseReportCount = 0,
    now = new Date(),
  } = options;

  const verifiedDate = typeof lastVerifiedAt === "string" ? new Date(lastVerifiedAt) : lastVerifiedAt;
  const elapsedMs = Math.max(0, now.getTime() - verifiedDate.getTime());
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

  // Exponential decay: S(t) = S0 * e^(-lambda * t)
  const decayFactor = Math.exp(-decayRatePerDay * elapsedDays);
  let decayedScore = initialScore * decayFactor;

  // Activity bonus: up to +5 points for steady verified traffic
  const activityBonus = Math.min(5, Math.log10(verifiedActivityCount + 1) * 2);
  decayedScore += activityBonus;

  // Abuse report severe penalty: -25 points per verified report
  decayedScore -= abuseReportCount * 25;

  return Math.max(0, Math.min(100, Math.round(decayedScore)));
}

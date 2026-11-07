import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { validateDidFormat, verifyEd25519Signature } from "../did";
import { calculateDecayedScore } from "../decay";
import { evaluateLinkTrust } from "../evaluator";

describe("HTN DID & Ed25519 Cryptography", () => {
  it("validates valid DID formats and rejects invalid ones", () => {
    expect(validateDidFormat("did:sunshade:tenant_12345")).toBe(true);
    expect(validateDidFormat("did:key:z6MkuSjhZpQ123")).toBe(true);
    expect(validateDidFormat("invalid-did")).toBe(false);
    expect(validateDidFormat("")).toBe(false);
  });

  it("verifies genuine Ed25519 signature and rejects tampered data", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const exportedPubDer = publicKey.export({ format: "der", type: "spki" });
    // Raw 32 bytes public key is the last 32 bytes of 44-byte SPKI DER
    const rawPubKeyHex = exportedPubDer.subarray(exportedPubDer.length - 32).toString("hex");

    const message = "https://sunshade.icu/launch";
    const signature = crypto.sign(null, Buffer.from(message), privateKey);
    const signatureHex = signature.toString("hex");

    // Genuine verification
    const isValid = verifyEd25519Signature(message, signatureHex, rawPubKeyHex);
    expect(isValid).toBe(true);

    // Tampered message
    const isTampered = verifyEd25519Signature("https://evil.com/phish", signatureHex, rawPubKeyHex);
    expect(isTampered).toBe(false);
  });
});

describe("Temporal Trust Decay", () => {
  it("applies exponential decay over elapsed time", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const thirtyDaysAgo = new Date("2026-10-08T12:00:00Z");

    const freshScore = calculateDecayedScore({
      initialScore: 90,
      lastVerifiedAt: now,
      now,
    });
    expect(freshScore).toBe(90);

    const decayedScore = calculateDecayedScore({
      initialScore: 90,
      lastVerifiedAt: thirtyDaysAgo,
      now,
    });
    expect(decayedScore).toBeLessThan(90);
    expect(decayedScore).toBeGreaterThan(70);
  });

  it("penalizes verified abuse reports heavily", () => {
    const now = new Date();
    const scoreWithAbuse = calculateDecayedScore({
      initialScore: 80,
      lastVerifiedAt: now,
      abuseReportCount: 2, // -50 pts
      now,
    });
    expect(scoreWithAbuse).toBe(30);
  });
});

describe("evaluateLinkTrust 4-Pillar Model", () => {
  it("evaluates verified high-trust link (tier: high, interstitial: false)", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const exportedPubDer = publicKey.export({ format: "der", type: "spki" });
    const rawPubKeyHex = exportedPubDer.subarray(exportedPubDer.length - 32).toString("hex");

    const destinationUrl = "https://sunshade.icu/promo";
    const signature = crypto.sign(null, Buffer.from(destinationUrl), privateKey);

    const result = evaluateLinkTrust({
      destinationUrl,
      isHttps: true,
      redirectHops: 0,
      responseTimeMs: 250,
      authorDid: "did:sunshade:verified_author",
      signatureHex: signature.toString("hex"),
      publicKeyHex: rawPubKeyHex,
      authorAgeDays: 60,
      hasSurveillanceTokens: false,
      hasPhishingIndicators: false,
    });

    expect(result.totalScore).toBeGreaterThanOrEqual(80);
    expect(result.tier).toBe("high");
    expect(result.interstitialRequired).toBe(false);
    expect(result.pillars.targetHygiene).toBe(25);
    expect(result.pillars.authorProvenance).toBe(35);
  });

  it("flags degraded link and requires interstitial warning (score < 60)", () => {
    const result = evaluateLinkTrust({
      destinationUrl: "http://insecure-site.org/redirect",
      isHttps: false,
      redirectHops: 4,
      responseTimeMs: 1400,
      hasSurveillanceTokens: true,
      hasPhishingIndicators: true,
      baselineReputation: 5,
    });

    expect(result.totalScore).toBeLessThan(60);
    expect(result.tier).toBe("degraded");
    expect(result.interstitialRequired).toBe(true);
    expect(result.flags).toContain("INSECURE_HTTP_PROTOCOL");
    expect(result.flags).toContain("SURVEILLANCE_TRACKER_TOKENS_DETECTED");
    expect(result.flags).toContain("PHISHING_SUSPICION");
  });
});

import { describe, it, expect } from "vitest";
import { checkRateLimit } from "../middleware/rateLimiter";

describe("rateLimiter", () => {
  it("allows standard requests within threshold", async () => {
    const res = await checkRateLimit({ clientIp: "10.0.0.1" });
    expect(res.allowed).toBe(true);
  });

  it("blocks rapid excessive requests in password challenge mode", async () => {
    const ip = "192.168.1.100";
    for (let i = 0; i < 5; i++) {
      const res = await checkRateLimit({ clientIp: ip, isPasswordChallenge: true });
      expect(res.allowed).toBe(true);
    }

    const blocked = await checkRateLimit({ clientIp: ip, isPasswordChallenge: true });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(900);
  });

  it("enforces tenant API key limits", async () => {
    const apiKey = "tk_live_test_ratelimit";
    for (let i = 0; i < 60; i++) {
      const res = await checkRateLimit({ clientIp: "10.0.0.2", apiKey });
      expect(res.allowed).toBe(true);
    }

    const blocked = await checkRateLimit({ clientIp: "10.0.0.2", apiKey });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getBioProfile, saveBioProfile, saveBioProfileAsync, resetBioStore } from "../lib/bioStore";

describe("BioStore Server Persistence (BUG_0006)", () => {
  beforeEach(() => {
    resetBioStore();
  });

  it("returns default profile for tymz initially", () => {
    const profile = getBioProfile("tymz");
    expect(profile.displayName).toBe("Tymz Pollack");
    expect(profile.username).toBe("tymz");
  });

  it("persists saved edits in shared server store so SSR reads updated profile", () => {
    const current = getBioProfile("tymz");
    current.displayName = "New Display Name";
    current.tagline = "Updated Tagline";

    const res = saveBioProfile(current);
    expect(res.success).toBe(true);

    const reloaded = getBioProfile("tymz");
    expect(reloaded.displayName).toBe("New Display Name");
    expect(reloaded.tagline).toBe("Updated Tagline");
  });

  it("handles @ handle prefix cleanly", () => {
    const profile = getBioProfile("@tymz");
    expect(profile.username).toBe("tymz");
  });

  it("propagates failure when server persistence fails in saveBioProfileAsync (ANALYSIS_0005)", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "DB connection timeout" }), { status: 500 }));

    try {
      const profile = getBioProfile("tymz");
      profile.displayName = "Failed Update";
      const res = await saveBioProfileAsync(profile);
      expect(res.success).toBe(false);
      expect(res.error).toContain("DB connection timeout");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("succeeds when server persistence confirms save in saveBioProfileAsync", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

    try {
      const profile = getBioProfile("tymz");
      profile.displayName = "Confirmed Update";
      const res = await saveBioProfileAsync(profile);
      expect(res.success).toBe(true);
      expect(getBioProfile("tymz").displayName).toBe("Confirmed Update");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

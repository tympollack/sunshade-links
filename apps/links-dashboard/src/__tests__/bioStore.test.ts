import { describe, it, expect, beforeEach } from "vitest";
import { getBioProfile, saveBioProfile, resetBioStore } from "../lib/bioStore";

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
});

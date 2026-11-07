import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getChannelsForSlug,
  addChannelForSlug,
  deleteChannelForSlug,
  getAllCampaigns,
  getDefaultChannelsForSlug,
  getServerStableCampaigns,
  saveChannelsForSlug,
} from "../lib/store";

describe("Links Store", () => {
  beforeEach(() => {
    deleteChannelForSlug("launch", "test-ch");
  });

  afterEach(() => {
    if ("window" in globalThis) {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  it("retrieves default launch channels", () => {
    const channels = getChannelsForSlug("launch");
    expect(channels.length).toBeGreaterThanOrEqual(4);
    expect(channels.some((c) => c.channel === "direct")).toBe(true);
    expect(channels.some((c) => c.channel === "bsky")).toBe(true);
  });

  it("provides server-stable campaign snapshot for initial SSR/CSR parity", () => {
    const snapshot = getServerStableCampaigns();
    expect(snapshot.length).toBe(1);
    expect(snapshot[0].slug).toBe("launch");
    expect(snapshot[0].channelCount).toBeGreaterThanOrEqual(4);
  });

  it("handles reserved prototype slugs (constructor, toString, valueOf) gracefully without crashing", () => {
    const constructorChannels = getChannelsForSlug("constructor");
    expect(constructorChannels).toBeDefined();
    expect(Array.isArray(constructorChannels)).toBe(true);
    expect(constructorChannels[0].slug).toBe("constructor");

    const toStringChannels = getChannelsForSlug("toString");
    expect(toStringChannels).toBeDefined();
    expect(Array.isArray(toStringChannels)).toBe(true);
  });

  it("prevents duplicate channel creation for the same slug", () => {
    const duplicate = addChannelForSlug("launch", {
      id: "dup-1",
      slug: "launch",
      channel: "bsky",
      destination: "https://sunshade.icu/launch",
      clicks: 0,
      telemetryCounts: [0, 0, 0, 0],
    });

    expect(duplicate.success).toBe(false);
    expect(duplicate.error).toContain('Channel "bsky" already exists');
  });

  it("successfully adds and persists a new unique channel", () => {
    const res = addChannelForSlug("launch", {
      id: "ch-test-unique",
      slug: "launch",
      channel: "mastodon",
      destination: "https://sunshade.icu/launch?utm_source=mastodon",
      clicks: 10,
      telemetryCounts: [2, 3, 5],
      trustScore: 99,
    });

    expect(res.success).toBe(true);
    const updated = getChannelsForSlug("launch");
    expect(updated.some((c) => c.channel === "mastodon")).toBe(true);

    // Clean up
    deleteChannelForSlug("launch", "ch-test-unique");
  });

  it("deletes a channel properly", () => {
    addChannelForSlug("launch", {
      id: "ch-to-delete",
      slug: "launch",
      channel: "temp",
      destination: "https://sunshade.icu/temp",
      clicks: 0,
      telemetryCounts: [0],
    });

    deleteChannelForSlug("launch", "ch-to-delete");
    const updated = getChannelsForSlug("launch");
    expect(updated.some((c) => c.id === "ch-to-delete")).toBe(false);
  });

  it("computes accurate campaign metrics across stored slugs", () => {
    const addResult = addChannelForSlug("summer", {
      id: "ch-summer-promo",
      slug: "summer",
      channel: "promo",
      destination: "https://sunshade.icu/summer?utm=promo",
      clicks: 25,
      telemetryCounts: [5, 10, 10],
      trustScore: 95,
    });
    expect(addResult.success).toBe(true);

    const campaigns = getAllCampaigns();
    expect(campaigns.length).toBeGreaterThanOrEqual(2);
    const launch = campaigns.find((c) => c.slug === "launch");
    expect(launch).toBeDefined();
    expect(launch!.channelCount).toBeGreaterThanOrEqual(4);

    const summer = campaigns.find((c) => c.slug === "summer");
    expect(summer).toBeDefined();
    expect(summer!.totalClicks).toBeGreaterThanOrEqual(25);
  });

  it("handles storage write errors gracefully without corrupting memory state", () => {
    const mockStorage = {
      setItem: vi.fn(() => {
        throw new Error("QuotaExceededError: DOM Exception 22");
      }),
      getItem: vi.fn(),
      length: 0,
      key: vi.fn(),
      clear: vi.fn(),
      removeItem: vi.fn(),
    };
    (globalThis as Record<string, unknown>).window = { localStorage: mockStorage };

    const res = saveChannelsForSlug("launch", [
      {
        id: "corrupted",
        slug: "launch",
        channel: "corrupted",
        destination: "https://bad.url",
        clicks: 0,
        telemetryCounts: [],
      },
    ]);

    expect(res.success).toBe(false);
    expect(res.error).toContain("Could not persist channel");

    // Verify memory store was not overwritten with the corrupted data
    const current = getChannelsForSlug("launch");
    expect(current.some((c) => c.channel === "corrupted")).toBe(false);
  });
});

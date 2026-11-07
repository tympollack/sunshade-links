import { describe, it, expect, beforeEach } from "vitest";
import {
  getChannelsForSlug,
  addChannelForSlug,
  deleteChannelForSlug,
  getAllCampaigns,
  getDefaultChannelsForSlug,
} from "../lib/store";

describe("Links Store", () => {
  beforeEach(() => {
    deleteChannelForSlug("launch", "test-ch");
  });

  it("retrieves default launch channels", () => {
    const channels = getChannelsForSlug("launch");
    expect(channels.length).toBeGreaterThanOrEqual(4);
    expect(channels.some((c) => c.channel === "direct")).toBe(true);
    expect(channels.some((c) => c.channel === "bsky")).toBe(true);
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
    const campaigns = getAllCampaigns();
    expect(campaigns.length).toBeGreaterThan(0);
    const launch = campaigns.find((c) => c.slug === "launch");
    expect(launch).toBeDefined();
    expect(launch!.channelCount).toBeGreaterThanOrEqual(4);
  });
});

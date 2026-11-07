import { ChannelData } from "@/components/links/ChannelRow";

export interface LinkCampaign {
  slug: string;
  title: string;
  channelCount: number;
  totalClicks: number;
  avgTrustScore: number;
  destination: string;
}

export const LAUNCH_DEFAULT_CHANNELS: ChannelData[] = [
  {
    id: "ch-1",
    slug: "launch",
    channel: "direct",
    destination: "https://sunshade.icu/launch",
    clicks: 142,
    telemetryCounts: [12, 18, 25, 30, 42, 55],
    trustScore: 98,
  },
  {
    id: "ch-2",
    slug: "launch",
    channel: "bsky",
    destination: "https://sunshade.icu/launch?utm_source=bsky",
    clicks: 89,
    telemetryCounts: [5, 12, 15, 20, 24, 28],
    trustScore: 95,
  },
  {
    id: "ch-3",
    slug: "launch",
    channel: "x",
    destination: "https://sunshade.icu/launch?utm_source=x",
    clicks: 64,
    telemetryCounts: [20, 18, 14, 10, 8, 4],
    trustScore: 88,
  },
  {
    id: "ch-4",
    slug: "launch",
    channel: "qr",
    destination: "https://sunshade.icu/launch?utm_source=flypack_qr",
    clicks: 210,
    telemetryCounts: [10, 25, 40, 70, 110, 155],
    trustScore: 100,
  },
];

const memoryStore: Record<string, ChannelData[]> = {
  launch: [...LAUNCH_DEFAULT_CHANNELS],
};

const STORAGE_PREFIX = "sunshade_links_";

function getStorageKey(slug: string): string {
  return `${STORAGE_PREFIX}${slug}`;
}

export function getChannelsForSlug(slug: string): ChannelData[] {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(getStorageKey(slug));
      if (stored) {
        return JSON.parse(stored) as ChannelData[];
      }
    } catch {
      // fallback to memory
    }
  }

  if (!memoryStore[slug]) {
    if (slug === "launch") {
      memoryStore[slug] = [...LAUNCH_DEFAULT_CHANNELS];
    } else {
      memoryStore[slug] = [
        {
          id: `${slug}-direct`,
          slug,
          channel: "direct",
          destination: `https://sunshade.icu/${slug}`,
          clicks: 0,
          telemetryCounts: [0, 0, 0, 0],
          trustScore: 100,
        },
      ];
    }
  }

  return [...memoryStore[slug]];
}

export function saveChannelsForSlug(slug: string, channels: ChannelData[]): void {
  memoryStore[slug] = [...channels];
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(getStorageKey(slug), JSON.stringify(channels));
    } catch {
      // ignore
    }
  }
}

export function addChannelForSlug(
  slug: string,
  newChannel: ChannelData
): { success: boolean; error?: string } {
  const channels = getChannelsForSlug(slug);
  const exists = channels.some(
    (c) => c.channel.toLowerCase() === newChannel.channel.toLowerCase()
  );

  if (exists) {
    return {
      success: false,
      error: `Channel "${newChannel.channel}" already exists for /${slug}.`,
    };
  }

  const updated = [...channels, newChannel];
  saveChannelsForSlug(slug, updated);
  return { success: true };
}

export function deleteChannelForSlug(slug: string, id: string): void {
  const channels = getChannelsForSlug(slug);
  const updated = channels.filter((c) => c.id !== id);
  saveChannelsForSlug(slug, updated);
}

export function getAllCampaigns(): LinkCampaign[] {
  const launchChannels = getChannelsForSlug("launch");
  const totalClicks = launchChannels.reduce((sum, c) => sum + c.clicks, 0);
  const avgTrustScore = launchChannels.length > 0
    ? Math.round(launchChannels.reduce((sum, c) => sum + (c.trustScore ?? 100), 0) / launchChannels.length)
    : 100;

  return [
    {
      slug: "launch",
      title: "SunShade Ecosystem Launch",
      channelCount: launchChannels.length,
      totalClicks,
      avgTrustScore,
      destination: "https://sunshade.icu/launch",
    },
  ];
}

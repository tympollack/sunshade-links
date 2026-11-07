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

// Use Map to avoid prototype inheritance collisions (e.g. constructor, toString)
// Keep memoryStore unseeded at startup so persisted channels (including for 'launch')
// are loaded from persistent storage before falling back to defaults.
const memoryStore = new Map<string, ChannelData[]>();

export function resetStore(): void {
  memoryStore.clear();
}

const STORAGE_PREFIX = "sunshade_links_";

function getStorageKey(slug: string): string {
  return `${STORAGE_PREFIX}${slug}`;
}

function getSafeLocalStorage(): Storage | null {
  try {
    if (typeof window !== "undefined") {
      return window.localStorage;
    }
  } catch {
    // SecurityError when storage is blocked in privacy/restricted contexts
  }
  return null;
}

export function getDefaultChannelsForSlug(slug: string): ChannelData[] {
  if (slug === "launch") {
    return [...LAUNCH_DEFAULT_CHANNELS];
  }
  return [
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

export function getChannelsForSlug(slug: string): ChannelData[] {
  // 1. Check in-memory store first
  if (memoryStore.has(slug)) {
    return [...memoryStore.get(slug)!];
  }

  // 2. Check localStorage if available
  const storage = getSafeLocalStorage();
  if (storage) {
    try {
      const stored = storage.getItem(getStorageKey(slug));
      if (stored) {
        const parsed = JSON.parse(stored) as ChannelData[];
        memoryStore.set(slug, parsed);
        return [...parsed];
      }
    } catch {
      // Fallback
    }
  }

  // 3. Fallback to default channels without polluting memoryStore
  return getDefaultChannelsForSlug(slug);
}

export function saveChannelsForSlug(
  slug: string,
  channels: ChannelData[]
): { success: boolean; error?: string } {
  const storage = getSafeLocalStorage();
  if (storage) {
    try {
      storage.setItem(getStorageKey(slug), JSON.stringify(channels));
    } catch (err) {
      // Storage quota blocked or write failure:
      // Do not update memoryStore to the failed value so the store remains truthful
      return {
        success: false,
        error: `Could not persist channel: ${err instanceof Error ? err.message : "storage quota exceeded"}`,
      };
    }
  }

  // Update in-memory store once persistence succeeds (or when storage is unavailable in memory-only mode)
  memoryStore.set(slug, [...channels]);
  return { success: true };
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
  return saveChannelsForSlug(slug, updated);
}

export function deleteChannelForSlug(
  slug: string,
  id: string
): { success: boolean; error?: string } {
  const channels = getChannelsForSlug(slug);
  const updated = channels.filter((c) => c.id !== id);
  return saveChannelsForSlug(slug, updated);
}

export function getServerStableCampaigns(): LinkCampaign[] {
  const launchChannels = LAUNCH_DEFAULT_CHANNELS;
  const totalClicks = launchChannels.reduce((sum, c) => sum + c.clicks, 0);
  const avgTrustScore = Math.round(
    launchChannels.reduce((sum, c) => sum + (c.trustScore ?? 100), 0) /
      launchChannels.length
  );
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

export function getAllCampaigns(): LinkCampaign[] {
  // Collect all known slugs from memoryStore and localStorage
  const slugs = new Set<string>(memoryStore.keys());

  const storage = getSafeLocalStorage();
  if (storage) {
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          slugs.add(key.slice(STORAGE_PREFIX.length));
        }
      }
    } catch {
      // ignore
    }
  }

  slugs.add("launch");

  return Array.from(slugs).map((slug) => {
    const channels = getChannelsForSlug(slug);
    const totalClicks = channels.reduce((sum, c) => sum + c.clicks, 0);
    const avgTrustScore =
      channels.length > 0
        ? Math.round(
            channels.reduce((sum, c) => sum + (c.trustScore ?? 100), 0) /
              channels.length
          )
        : 100;
    const directChannel = channels.find((c) => c.channel === "direct");

    return {
      slug,
      title:
        slug === "launch"
          ? "SunShade Ecosystem Launch"
          : `Campaign /${slug}`,
      channelCount: channels.length,
      totalClicks,
      avgTrustScore,
      destination:
        directChannel?.destination || `https://sunshade.icu/${slug}`,
    };
  });
}

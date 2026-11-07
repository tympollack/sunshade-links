export type BioTheme = "slate" | "midnight" | "emerald" | "sunset";

export interface BioLinkItem {
  id: string;
  title: string;
  url: string;
  icon?: string;
  isActive: boolean;
}

export interface BioSocials {
  github?: string;
  twitter?: string;
  bluesky?: string;
  discord?: string;
  email?: string;
  website?: string;
}

export interface BioProfile {
  username: string;
  displayName: string;
  tagline: string;
  bio: string;
  avatarUrl: string;
  theme: BioTheme;
  trustScore: number;
  socials: BioSocials;
  links: BioLinkItem[];
  rssFeedUrl?: string;
}

export const DEFAULT_BIO_PROFILES: Record<string, BioProfile> = {
  tymz: {
    username: "tymz",
    displayName: "Tymz Pollack",
    tagline: "Building SunShade Systems",
    bio: "Decentralized trust, autonomous agent architectures, and high-performance edge systems.",
    avatarUrl: "https://avatars.githubusercontent.com/u/10200159?v=4",
    theme: "slate",
    trustScore: 99,
    socials: {
      github: "https://github.com/tympollack",
      bluesky: "https://bsky.app/profile/tymz.bsky.social",
      website: "https://sunshade.icu",
    },
    links: [
      {
        id: "lnk-1",
        title: "SunShade Links Network",
        url: "https://links.sunshade.icu/launch",
        icon: "zap",
        isActive: true,
      },
      {
        id: "lnk-2",
        title: "HTN Trust Engine Whitepaper",
        url: "https://sunshade.icu/trust",
        icon: "shield",
        isActive: true,
      },
      {
        id: "lnk-3",
        title: "GitHub Repositories",
        url: "https://github.com/tympollack",
        icon: "code",
        isActive: true,
      },
    ],
    rssFeedUrl: "https://blog.cloudflare.com/rss/",
  },
  demo: {
    username: "demo",
    displayName: "Demo Creator",
    tagline: "SunShade Verified Publisher",
    bio: "Explore verified projects, links, and syndication feeds.",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop",
    theme: "emerald",
    trustScore: 95,
    socials: {
      website: "https://sunshade.icu",
    },
    links: [
      {
        id: "demo-1",
        title: "Visit Main Portal",
        url: "https://sunshade.icu",
        isActive: true,
      },
    ],
  },
};

const STORAGE_BIO_PREFIX = "sunshade_bio_";

export function getBioProfile(username: string): BioProfile {
  const cleanUsername = username.toLowerCase().replace(/^@/, "");

  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(`${STORAGE_BIO_PREFIX}${cleanUsername}`);
      if (stored) {
        return JSON.parse(stored) as BioProfile;
      }
    } catch {
      // LocalStorage access fallback
    }
  }

  if (DEFAULT_BIO_PROFILES[cleanUsername]) {
    return DEFAULT_BIO_PROFILES[cleanUsername];
  }

  // Fallback profile template for any new handle
  return {
    username: cleanUsername,
    displayName: `@${cleanUsername}`,
    tagline: "SunShade Link Profile",
    bio: "Welcome to my verified link bio page.",
    avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${cleanUsername}`,
    theme: "slate",
    trustScore: 85,
    socials: {},
    links: [
      {
        id: `default-${cleanUsername}`,
        title: "Home",
        url: "https://sunshade.icu",
        isActive: true,
      },
    ],
  };
}

export function saveBioProfile(profile: BioProfile): { success: boolean; error?: string } {
  const cleanUsername = profile.username.toLowerCase().replace(/^@/, "");
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(`${STORAGE_BIO_PREFIX}${cleanUsername}`, JSON.stringify(profile));
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : "Storage error" };
    }
  }
  return { success: true };
}

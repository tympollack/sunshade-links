import React from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBioProfile, BioTheme } from "@/lib/bioStore";
import { RssFeedBlock } from "@/components/bio/blocks/RssFeedBlock";
import { ShieldCheck, Globe, Mail, ExternalLink } from "lucide-react";

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

function TwitterIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
    </svg>
  );
}

interface PageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = getBioProfile(username);

  return {
    title: `${profile.displayName} (@${profile.username}) — SunShade Bio`,
    description: profile.bio || profile.tagline,
    openGraph: {
      title: `${profile.displayName} (@${profile.username})`,
      description: profile.bio || profile.tagline,
      images: [
        {
          url: profile.avatarUrl,
          width: 400,
          height: 400,
          alt: profile.displayName,
        },
      ],
      type: "profile",
    },
    twitter: {
      card: "summary",
      title: profile.displayName,
      description: profile.bio || profile.tagline,
      images: [profile.avatarUrl],
    },
  };
}

const THEME_STYLES: Record<BioTheme, { bg: string; card: string; hover: string; accent: string; border: string }> = {
  slate: {
    bg: "bg-slate-950 text-slate-100",
    card: "bg-slate-900/70 text-slate-200 border-slate-800",
    hover: "hover:bg-slate-900 hover:border-amber-500/50 hover:text-amber-400",
    accent: "text-amber-400",
    border: "border-slate-800",
  },
  midnight: {
    bg: "bg-black text-zinc-100",
    card: "bg-zinc-900/80 text-zinc-200 border-zinc-800",
    hover: "hover:bg-zinc-900 hover:border-indigo-500/50 hover:text-indigo-400",
    accent: "text-indigo-400",
    border: "border-zinc-800",
  },
  emerald: {
    bg: "bg-[#03150d] text-emerald-100",
    card: "bg-[#062417]/80 text-emerald-200 border-emerald-900/60",
    hover: "hover:bg-[#08301f] hover:border-emerald-400/50 hover:text-emerald-300",
    accent: "text-emerald-400",
    border: "border-emerald-900/60",
  },
  sunset: {
    bg: "bg-gradient-to-b from-slate-950 via-[#180a24] to-slate-950 text-slate-100",
    card: "bg-purple-950/40 text-purple-200 border-purple-900/40",
    hover: "hover:bg-purple-900/50 hover:border-rose-400/50 hover:text-rose-300",
    accent: "text-rose-400",
    border: "border-purple-900/40",
  },
};

export default async function BioProfilePage({ params }: PageProps) {
  const { username } = await params;
  if (!username) notFound();

  const profile = getBioProfile(username);
  const theme = THEME_STYLES[profile.theme] || THEME_STYLES.slate;

  return (
    <div className={`min-h-[100dvh] w-full flex flex-col items-center justify-between p-4 sm:p-8 ${theme.bg}`}>
      <main className="w-full max-w-md mx-auto flex flex-col items-center text-center space-y-6 pt-8 pb-12">
        {/* Avatar & Badges */}
        <div className="relative group">
          <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-500 shadow-xl overflow-hidden">
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              className="w-full h-full object-cover rounded-full bg-slate-900"
            />
          </div>
          {profile.trustScore >= 80 && (
            <div
              title={`Trust Score: ${profile.trustScore}/100`}
              className="absolute -bottom-1 -right-1 flex items-center gap-1 bg-emerald-500/90 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-emerald-300"
            >
              <ShieldCheck className="w-3 h-3" />
              <span>{profile.trustScore}</span>
            </div>
          )}
        </div>

        {/* Identity Headings */}
        <div className="space-y-1.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            {profile.displayName}
          </h1>
          <p className="text-xs font-mono font-medium opacity-70">@{profile.username}</p>
          {profile.tagline && (
            <p className={`text-xs font-medium ${theme.accent} mt-1`}>{profile.tagline}</p>
          )}
          {profile.bio && (
            <p className="text-xs sm:text-sm text-slate-400 max-w-xs mx-auto mt-2 leading-relaxed">
              {profile.bio}
            </p>
          )}
        </div>

        {/* Social Link Badges */}
        {Object.values(profile.socials).some(Boolean) && (
          <div className="flex items-center justify-center gap-3 py-1">
            {profile.socials.website && (
              <a
                href={profile.socials.website}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full bg-slate-900/60 border border-slate-800 hover:text-white hover:border-slate-600 transition"
                aria-label="Website"
              >
                <Globe className="w-4 h-4" />
              </a>
            )}
            {profile.socials.github && (
              <a
                href={profile.socials.github}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full bg-slate-900/60 border border-slate-800 hover:text-white hover:border-slate-600 transition"
                aria-label="GitHub"
              >
                <GithubIcon className="w-4 h-4" />
              </a>
            )}
            {profile.socials.twitter && (
              <a
                href={profile.socials.twitter}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full bg-slate-900/60 border border-slate-800 hover:text-white hover:border-slate-600 transition"
                aria-label="Twitter"
              >
                <TwitterIcon className="w-4 h-4" />
              </a>
            )}
            {profile.socials.email && (
              <a
                href={`mailto:${profile.socials.email}`}
                className="p-2 rounded-full bg-slate-900/60 border border-slate-800 hover:text-white hover:border-slate-600 transition"
                aria-label="Email"
              >
                <Mail className="w-4 h-4" />
              </a>
            )}
          </div>
        )}

        {/* Link Cards List */}
        <div className="w-full space-y-3 pt-2">
          {profile.links
            .filter((l) => l.isActive)
            .map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex items-center justify-between p-4 rounded-xl border backdrop-blur transition-all shadow-sm active:scale-[0.98] ${theme.card} ${theme.hover}`}
              >
                <span className="text-sm font-semibold tracking-wide text-left">{link.title}</span>
                <ExternalLink className="w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </a>
            ))}
        </div>

        {/* RSS Feed Block (if enabled) */}
        {profile.rssFeedUrl && (
          <RssFeedBlock feedUrl={profile.rssFeedUrl} maxItems={3} />
        )}
      </main>

      {/* Footer Branding */}
      <footer className="py-6 text-center text-xs opacity-50 font-mono">
        <a
          href="https://sunshade.icu"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:opacity-100 transition underline underline-offset-4"
        >
          Powered by SunShade Links
        </a>
      </footer>
    </div>
  );
}

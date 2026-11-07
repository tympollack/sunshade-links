import Link from "next/link";

interface LinkCampaign {
  slug: string;
  title: string;
  channelCount: number;
  totalClicks: number;
  avgTrustScore: number;
  destination: string;
}

const CAMPAIGNS: LinkCampaign[] = [
  {
    slug: "launch",
    title: "SunShade Ecosystem Launch",
    channelCount: 4,
    totalClicks: 505,
    avgTrustScore: 95,
    destination: "https://sunshade.icu/launch",
  },
];

export default function LinksListingPage() {
  return (
    <div className="flex flex-col min-h-[100dvh] bg-slate-950 text-slate-100 pb-[env(safe-area-inset-bottom,24px)]">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/80 backdrop-blur px-4 py-3.5 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-mono text-slate-400 hover:text-slate-200 transition"
            >
              ← Home
            </Link>
            <span className="text-slate-600">/</span>
            <h1 className="text-sm font-mono font-semibold text-amber-400">
              links.sunshade.icu/links
            </h1>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">All Tracked Links</h2>
          <p className="text-xs text-slate-400">
            Active shortlink campaigns routing through the SunShade telemetry network.
          </p>
        </div>

        <div className="space-y-3">
          {CAMPAIGNS.map((item) => (
            <Link
              key={item.slug}
              href={`/links/${item.slug}`}
              className="group block p-4 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-amber-500/40 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-100 group-hover:text-amber-400 transition-colors">
                      /{item.slug}
                    </span>
                    <span className="text-xs text-slate-500">·</span>
                    <span className="text-xs text-slate-300">{item.title}</span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono truncate max-w-md">
                    → {item.destination}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                  <span>{item.channelCount} Channels</span>
                  <span>{item.totalClicks} Total Clicks</span>
                  <span className="text-emerald-400">Trust: {item.avgTrustScore}/100</span>
                  <span className="text-amber-400 group-hover:translate-x-1 transition-transform">
                    →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}

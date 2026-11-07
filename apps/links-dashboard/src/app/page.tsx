import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center space-y-6">
      <div className="space-y-2">
        <span className="text-xs font-mono uppercase tracking-widest text-amber-400">
          SunShade Systems
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100 sm:text-4xl">
          links.sunshade.icu
        </h1>
        <p className="max-w-md mx-auto text-sm text-slate-400">
          Decentralized link management, zero-surveillance telemetry, and algorithmic trust scoring.
        </p>
      </div>

      <div className="flex gap-4">
        <Link
          href="/links/launch"
          className="px-4 py-2 text-xs font-medium rounded-md bg-amber-500 text-slate-950 hover:bg-amber-400 font-mono transition"
        >
          View Dashboard Example (/links/launch) →
        </Link>
      </div>
    </main>
  );
}

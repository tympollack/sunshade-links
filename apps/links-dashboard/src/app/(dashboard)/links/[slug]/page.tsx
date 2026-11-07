"use client";

import React, { useState } from "react";
import { ChannelRow, ChannelData, formatVanityUrl } from "@/components/links/ChannelRow";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const DEFAULT_CHANNELS: ChannelData[] = [
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

export default function LinkChannelsPage({ params }: PageProps) {
  const unwrappedParams = React.use(params);
  const slug = unwrappedParams.slug || "link";

  const [channels, setChannels] = useState<ChannelData[]>(
    DEFAULT_CHANNELS.map((c) => ({ ...c, slug }))
  );
  const [selectedChannel, setSelectedChannel] = useState<ChannelData | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  const handleDelete = (id: string) => {
    setChannels((prev) => prev.filter((c) => c.id !== id));
  };

  const handleOpenQr = (channel: ChannelData) => {
    setSelectedChannel(channel);
    setQrModalOpen(true);
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-slate-950 text-slate-100 pb-[env(safe-area-inset-bottom,24px)]">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/80 backdrop-blur px-4 py-3.5 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/links"
              className="text-xs font-mono text-slate-400 hover:text-slate-200 transition"
            >
              ← All Links
            </a>
            <span className="text-slate-600">/</span>
            <h1 className="text-sm font-mono font-semibold text-amber-400">
              links.sunshade.icu/{slug}
            </h1>
          </div>
          <div className="text-xs text-slate-400 font-mono">
            {channels.length} {channels.length === 1 ? "Channel" : "Channels"}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Distribution Channels</h2>
            <p className="text-xs text-slate-400">
              Tracked routing URLs with privacy sanitization and real-time telemetry.
            </p>
          </div>
        </div>

        {/* Channel Listing: Stacked cards on mobile (<640px), table row alignment on desktop */}
        <div className="space-y-2.5">
          {channels.map((channel) => (
            <ChannelRow
              key={channel.id}
              data={channel}
              onDelete={handleDelete}
              onOpenQr={handleOpenQr}
            />
          ))}

          {channels.length === 0 && (
            <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg text-slate-500 text-sm">
              No channels created yet for this slug.
            </div>
          )}
        </div>
      </main>

      {/* Docked Action Dock on Mobile / Sticky Toolbar */}
      <div className="sticky bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400 hidden sm:block">
            Tap any row slug to copy verified shortlink.
          </div>
          <button
            type="button"
            className="w-full sm:w-auto px-4 py-2 text-xs font-medium rounded-md bg-amber-500 text-slate-950 hover:bg-amber-400 font-mono transition"
          >
            + Create New Channel
          </button>
        </div>
      </div>

      {/* QR Modal */}
      {qrModalOpen && selectedChannel && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setQrModalOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-sm text-slate-100 font-mono">
                QR: /{selectedChannel.slug}/{selectedChannel.channel}
              </h3>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-white rounded-lg flex items-center justify-center">
              {/* Fallback QR representation */}
              <div className="w-48 h-48 border-2 border-slate-900 flex flex-col items-center justify-center text-slate-900 text-xs font-mono text-center p-2">
                <span className="font-bold">SUNSHADE LINK</span>
                <span className="text-[10px] break-all mt-2">
                  {formatVanityUrl(selectedChannel.slug, selectedChannel.channel)}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 font-mono text-center">
              Trust Score: {selectedChannel.trustScore ?? 100}/100
            </p>

            <button
              type="button"
              onClick={() => setQrModalOpen(false)}
              className="w-full py-2 text-xs font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

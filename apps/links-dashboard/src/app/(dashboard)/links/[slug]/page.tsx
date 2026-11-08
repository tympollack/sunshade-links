"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ChannelRow, ChannelData, formatVanityUrl } from "@/components/links/ChannelRow";
import { TrustBadge } from "@/components/trust/TrustBadge";
import { TrustDrawer } from "@/components/trust/TrustDrawer";
import {
  getDefaultChannelsForSlug,
  getChannelsForSlug,
  addChannelForSlug,
  deleteChannelForSlug,
  syncChannelToServer,
} from "@/lib/store";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function LinkChannelsPage({ params }: PageProps) {
  const unwrappedParams = React.use(params);
  const slug = unwrappedParams.slug || "link";

  // Initialize with server-safe defaults to avoid hydration mismatches
  const [channels, setChannels] = useState<ChannelData[]>(() =>
    getDefaultChannelsForSlug(slug)
  );
  const [selectedChannel, setSelectedChannel] = useState<ChannelData | null>(null);
  const [trustChannel, setTrustChannel] = useState<ChannelData | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [trustDrawerOpen, setTrustDrawerOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const handleOpenTrust = (channel: ChannelData) => {
    setTrustChannel(channel);
    setTrustDrawerOpen(true);
  };

  const avgTrustScore =
    channels.length > 0
      ? Math.round(
          channels.reduce((sum, c) => sum + (c.trustScore ?? 100), 0) /
            channels.length
        )
      : 100;

  // New channel form state & validation errors
  const [newChannelName, setNewChannelName] = useState("");
  const [newDestination, setNewDestination] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Load persisted channels after mount to ensure seamless hydration and sync with backend
  useEffect(() => {
    setChannels(getChannelsForSlug(slug));

    // Fetch server-persisted channels for this slug
    fetch(`/api/v1/links?search=${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && Array.isArray(json.data) && json.data.length > 0) {
          const serverChannels: ChannelData[] = json.data
            .filter((item: any) => item.slug === slug)
            .map((item: any) => ({
              id: item.id,
              slug: item.slug,
              channel: item.channel_tag || "direct",
              destination: item.destination_url,
              clicks: item.clicks || 0,
              telemetryCounts: [0, 0, 0, 0],
              trustScore: item.trust_score ?? 100,
            }));

          if (serverChannels.length > 0) {
            const merged = [...getChannelsForSlug(slug)];
            for (const sc of serverChannels) {
              const idx = merged.findIndex((c) => c.channel === sc.channel);
              if (idx >= 0) {
                merged[idx] = { ...merged[idx], destination: sc.destination, trustScore: sc.trustScore };
              } else {
                merged.push(sc);
              }
            }
            setChannels(merged);
          }
        }
      })
      .catch(() => {});
  }, [slug]);

  const handleDelete = async (id: string) => {
    const res = deleteChannelForSlug(slug, id);
    if (!res.success) {
      alert(res.error || "Failed to delete channel.");
      return;
    }
    setChannels(getChannelsForSlug(slug));

    if (id && !id.startsWith("ch-")) {
      try {
        await fetch(`/api/v1/links/${id}`, { method: "DELETE" });
      } catch {
        // Ignore network delete error
      }
    }
  };

  const handleOpenQr = (channel: ChannelData) => {
    setSelectedChannel(channel);
    setQrModalOpen(true);
  };

  const handleOpenCreateModal = () => {
    setNewChannelName("");
    setNewDestination(`https://sunshade.icu/${slug}`);
    setFormError(null);
    setCreateModalOpen(true);
  };

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const rawInput = newChannelName.trim();
    if (!rawInput) {
      setFormError("Channel identifier is required.");
      return;
    }

    // Verify valid alphanumeric, dash, or underscore characters
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validPattern.test(rawInput)) {
      setFormError(
        "Invalid identifier: only letters, numbers, hyphens (-), and underscores (_) are allowed."
      );
      return;
    }

    const cleanChannel = rawInput.toLowerCase();

    // Check for duplicate channel
    const duplicate = channels.some(
      (c) => c.channel.toLowerCase() === cleanChannel
    );
    if (duplicate) {
      setFormError(
        `Channel "${cleanChannel}" already exists for this link. Choose a unique channel name.`
      );
      return;
    }

    const dest = newDestination.trim();
    if (!dest) {
      setFormError("Destination URL is required.");
      return;
    }

    try {
      const parsedUrl = new URL(dest);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        setFormError("Destination URL must use http:// or https://");
        return;
      }
    } catch {
      setFormError("Invalid destination URL. Please enter a valid URL.");
      return;
    }

    const newChannelItem: ChannelData = {
      id: `ch-${Date.now()}`,
      slug,
      channel: cleanChannel,
      destination: dest,
      clicks: 0,
      telemetryCounts: [0, 0, 0, 0],
      trustScore: 100,
    };

    const result = addChannelForSlug(slug, newChannelItem);
    if (!result.success) {
      setFormError(result.error ?? "Failed to add channel.");
      return;
    }

    // Persist channel to backend API so Worker and DB resolve the new channel destination (BUG_0004)
    syncChannelToServer(slug, newChannelItem).catch(() => {});

    setChannels(getChannelsForSlug(slug));
    setCreateModalOpen(false);
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-slate-950 text-slate-100 pb-[env(safe-area-inset-bottom,24px)]">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/80 backdrop-blur px-4 py-3.5 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/links"
              className="text-xs font-mono text-slate-400 hover:text-slate-200 transition"
            >
              ← All Links
            </Link>
            <span className="text-slate-600">/</span>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-mono font-semibold text-amber-400">
                links.sunshade.icu/{slug}
              </h1>
              <TrustBadge
                score={avgTrustScore}
                size="sm"
                onClick={() => {
                  setTrustChannel(channels[0] || null);
                  setTrustDrawerOpen(true);
                }}
              />
            </div>
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
              onOpenTrust={handleOpenTrust}
            />
          ))}

          {channels.length === 0 && (
            <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg text-slate-500 text-sm">
              <p>No channels created yet for this slug.</p>
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="mt-3 px-3 py-1.5 text-xs font-mono text-amber-400 hover:text-amber-300 underline"
              >
                + Add your first channel
              </button>
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
            onClick={handleOpenCreateModal}
            className="w-full sm:w-auto px-4 py-2 text-xs font-medium rounded-md bg-amber-500 text-slate-950 hover:bg-amber-400 font-mono transition"
          >
            + Create New Channel
          </button>
        </div>
      </div>

      {/* Create Channel Modal */}
      {createModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setCreateModalOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-sm text-slate-100 font-mono">
                Create New Channel for /{slug}
              </h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div
                role="alert"
                className="p-3 text-xs rounded bg-rose-500/10 border border-rose-500/30 text-rose-300"
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateChannel} noValidate className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">
                  Channel Identifier (e.g. bsky, linkedin, substack, qr)
                </label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => {
                    setNewChannelName(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="e.g. bsky"
                  className="w-full px-3 py-2 text-xs font-mono rounded bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">
                  Destination URL
                </label>
                <input
                  type="text"
                  value={newDestination}
                  onChange={(e) => {
                    setNewDestination(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="https://sunshade.icu/..."
                  className="w-full px-3 py-2 text-xs font-mono rounded bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-medium rounded bg-amber-500 text-slate-950 hover:bg-amber-400 font-mono transition"
                >
                  Add Channel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

            <div className="p-4 bg-white rounded-lg flex flex-col items-center justify-center space-y-3">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                  formatVanityUrl(selectedChannel.slug, selectedChannel.channel)
                )}`}
                alt={`Scannable QR code for ${formatVanityUrl(selectedChannel.slug, selectedChannel.channel)}`}
                width={180}
                height={180}
                className="w-44 h-44 rounded"
                loading="lazy"
              />
              <span className="text-[11px] font-mono text-slate-700 break-all text-center max-w-[200px]">
                {formatVanityUrl(selectedChannel.slug, selectedChannel.channel)}
              </span>
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
      {/* Trust Audit Drawer */}
      <TrustDrawer
        isOpen={trustDrawerOpen}
        onClose={() => setTrustDrawerOpen(false)}
        slug={slug}
        destinationUrl={trustChannel?.destination || `https://sunshade.icu/${slug}`}
        trustScore={trustChannel?.trustScore ?? avgTrustScore}
      />
    </div>
  );
}

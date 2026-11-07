"use client";

import React, { useState } from "react";
import { InlineSparkline } from "../analytics/InlineSparkline";

export interface ChannelData {
  id: string;
  slug: string;
  channel: string;
  destination: string;
  clicks: number;
  telemetryCounts: number[];
  trustScore?: number;
  qrPayload?: string;
}

export interface ChannelRowProps {
  data: ChannelData;
  domain?: string;
  onDelete?: (id: string) => void;
  onOpenQr?: (data: ChannelData) => void;
}

export function formatVanityUrl(slug: string, channel: string, domain = "links.sunshade.icu"): string {
  const cleanSlug = slug.replace(/^\/+/, "");
  const cleanChannel = channel.replace(/^\/+/, "");
  if (!cleanChannel || cleanChannel === "direct") {
    return `https://${domain}/${cleanSlug}`;
  }
  return `https://${domain}/${cleanSlug}/${cleanChannel}`;
}

export function ChannelRow({
  data,
  domain = "links.sunshade.icu",
  onDelete,
  onOpenQr,
}: ChannelRowProps) {
  const [copied, setCopied] = useState(false);
  const fullUrl = formatVanityUrl(data.slug, data.channel, domain);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(fullUrl);
        if (typeof navigator.vibrate === "function") {
          try {
            navigator.vibrate(15);
          } catch {
            // vibration not supported or blocked
          }
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      // Fallback or permission blocked
    }
  };

  return (
    <div
      className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-900/90 transition-all text-sm"
      data-testid="channel-row"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-mono font-medium rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
          {data.channel}
        </span>

        <button
          type="button"
          onClick={handleCopy}
          className="text-left font-mono truncate text-slate-200 hover:text-amber-300 transition-colors focus:outline-none"
          title="Click to copy vanity URL"
          aria-label={`Copy link for ${data.channel}`}
        >
          <span className="text-slate-500">{domain}/</span>
          <span className="font-semibold text-slate-100">{data.slug}</span>
          {data.channel && data.channel !== "direct" && (
            <span className="text-amber-400/90">/{data.channel}</span>
          )}
        </button>

        {copied && (
          <span
            role="status"
            className="animate-in fade-in duration-200 text-[11px] font-sans px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
          >
            Copied!
          </span>
        )}
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
        {/* Micro sparkline with authoritative total clicks */}
        <div className="flex items-center gap-2">
          <InlineSparkline
            data={data.telemetryCounts}
            totalCount={data.clicks}
            width={64}
            height={18}
          />
          <span className="text-xs font-mono text-slate-400 min-w-10 text-right">
            {data.clicks} clicks
          </span>
        </div>

        {/* Action icons / context */}
        <div className="flex items-center gap-1.5">
          {onOpenQr && (
            <button
              type="button"
              onClick={() => onOpenQr(data)}
              className="p-1.5 text-xs rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
              aria-label="View QR code"
            >
              QR
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(data.id)}
              className="p-1.5 text-xs rounded text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 transition"
              aria-label="Delete channel"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

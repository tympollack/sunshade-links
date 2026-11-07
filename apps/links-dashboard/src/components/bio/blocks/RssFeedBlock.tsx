"use client";

import React, { useEffect, useState } from "react";
import { RssFeedItem, RssFeedResult, fetchRssFeed } from "@/lib/rssSync";
import { Rss, ExternalLink } from "lucide-react";

interface RssFeedBlockProps {
  feedUrl: string;
  maxItems?: number;
  initialItems?: RssFeedItem[];
}

export function RssFeedBlock({ feedUrl, maxItems = 3, initialItems = [] }: RssFeedBlockProps) {
  const [items, setItems] = useState<RssFeedItem[]>(initialItems);
  const [loading, setLoading] = useState(initialItems.length === 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialItems.length > 0) return;
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        const result: RssFeedResult = await fetchRssFeed(feedUrl, maxItems);
        if (mounted) {
          if (result.error) {
            setError(result.error);
          } else {
            setItems(result.items);
          }
        }
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load feed");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (feedUrl) {
      load();
    }
    return () => {
      mounted = false;
    };
  }, [feedUrl, maxItems, initialItems.length]);

  if (!feedUrl) return null;

  return (
    <div className="w-full space-y-2 mt-4">
      <div className="flex items-center gap-2 px-1 text-xs font-mono text-slate-400">
        <Rss className="w-3.5 h-3.5 text-amber-500" />
        <span>Recent Articles & Updates</span>
      </div>

      {loading && (
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 text-center text-xs text-slate-500 animate-pulse">
          Loading RSS updates...
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl border border-red-900/30 bg-red-950/20 text-xs text-red-400">
          RSS Feed unavailable: {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 text-center text-xs text-slate-500">
          No recent items found.
        </div>
      )}

      {!loading &&
        items.map((item, idx) => (
          <a
            key={idx}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/60 hover:bg-slate-900 hover:border-amber-500/40 transition-all text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-medium text-slate-200 group-hover:text-amber-400 transition-colors line-clamp-1">
                {item.title}
              </h4>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 flex-shrink-0 mt-0.5" />
            </div>

            {item.description && (
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                {item.description}
              </p>
            )}

            {item.pubDate && (
              <span className="text-[10px] font-mono text-slate-500 mt-2">
                {new Date(item.pubDate).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </a>
        ))}
    </div>
  );
}

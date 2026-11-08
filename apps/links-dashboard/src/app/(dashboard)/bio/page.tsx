"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  BioProfile,
  BioTheme,
  BioLinkItem,
  getBioProfile,
  saveBioProfile,
  saveBioProfileAsync,
} from "@/lib/bioStore";
import {
  Plus,
  Trash2,
  ExternalLink,
  Save,
  Check,
  Eye,
  Smartphone,
  ShieldCheck,
  Rss,
} from "lucide-react";

export default function BioBuilderPage() {
  const [profile, setProfile] = useState<BioProfile>(() => getBioProfile("tymz"));
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  useEffect(() => {
    setProfile(getBioProfile("tymz"));
  }, []);

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await saveBioProfileAsync(profile);
      if (res.success) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      } else {
        alert(res.error || "Failed to save profile");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkTitle.trim() || !newLinkUrl.trim()) return;

    const newLink: BioLinkItem = {
      id: `lnk-${Date.now()}`,
      title: newLinkTitle.trim(),
      url: newLinkUrl.trim(),
      isActive: true,
    };

    setProfile((prev) => ({
      ...prev,
      links: [...prev.links, newLink],
    }));

    setNewLinkTitle("");
    setNewLinkUrl("");
  };

  const handleToggleLink = (id: string) => {
    setProfile((prev) => ({
      ...prev,
      links: prev.links.map((l) => (l.id === id ? { ...l, isActive: !l.isActive } : l)),
    }));
  };

  const handleDeleteLink = (id: string) => {
    setProfile((prev) => ({
      ...prev,
      links: prev.links.filter((l) => l.id !== id),
    }));
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-slate-950 text-slate-100 pb-[env(safe-area-inset-bottom,24px)]">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/80 backdrop-blur px-4 py-3.5 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/links" className="text-xs font-mono text-slate-400 hover:text-slate-200 transition">
              ← Dashboard
            </Link>
            <span className="text-slate-600">/</span>
            <h1 className="text-sm font-mono font-semibold text-amber-400">
              Bio Page Builder (@{profile.username})
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`/${profile.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
            >
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              <span>Preview Live</span>
            </a>

            <button
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400 transition"
            >
              {savedSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              <span>{savedSuccess ? "Saved!" : "Save Changes"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Split-Pane Workspace */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Bio Configuration Editor */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section 1: Profile Identity */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Profile Identity</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={profile.displayName}
                  onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Username Handle</label>
                <input
                  type="text"
                  value={profile.username}
                  onChange={(e) => setProfile({ ...profile, username: e.target.value.toLowerCase() })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">Tagline</label>
              <input
                type="text"
                value={profile.tagline}
                onChange={(e) => setProfile({ ...profile, tagline: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">Bio Description</label>
              <textarea
                rows={3}
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">Avatar Image URL</label>
              <input
                type="url"
                value={profile.avatarUrl}
                onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-amber-500 font-mono text-xs"
              />
            </div>
          </div>

          {/* Section 2: Visual Theme Selector */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Visual Theme</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(["slate", "midnight", "emerald", "sunset"] as BioTheme[]).map((thm) => (
                <button
                  key={thm}
                  type="button"
                  onClick={() => setProfile({ ...profile, theme: thm })}
                  className={`p-3 rounded-xl border text-center transition capitalize font-medium text-xs ${
                    profile.theme === thm
                      ? "border-amber-500 bg-amber-500/10 text-amber-300 font-semibold"
                      : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  {thm}
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Links Manager */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Bio Links</h2>
              <span className="text-xs font-mono text-slate-500">{profile.links.length} total</span>
            </div>

            {/* Existing Links List */}
            <div className="space-y-2">
              {profile.links.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950/80 gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${link.isActive ? "text-slate-200" : "text-slate-500 line-through"}`}>
                      {link.title}
                    </p>
                    <p className="text-xs font-mono text-slate-500 truncate">{link.url}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleLink(link.id)}
                      className={`text-xs px-2.5 py-1 rounded-md border font-mono transition ${
                        link.isActive
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-slate-800 bg-slate-900 text-slate-500"
                      }`}
                    >
                      {link.isActive ? "Active" : "Disabled"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteLink(link.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 transition"
                      aria-label="Delete link"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add New Link Form */}
            <form onSubmit={handleAddLink} className="p-3.5 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 space-y-3">
              <h3 className="text-xs font-mono font-medium text-slate-400">Add New Link Card</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Label (e.g. My Newsletter)"
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Link</span>
              </button>
            </form>
          </div>

          {/* Section 4: RSS Feed Integration */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
              <Rss className="w-4 h-4 text-amber-500" />
              <span>RSS / Atom Feed Syndication</span>
            </div>
            <p className="text-xs text-slate-400">
              Automatically syndicate your latest blog posts or newsletter articles directly onto your bio profile.
            </p>
            <input
              type="url"
              placeholder="https://blog.example.com/rss.xml"
              value={profile.rssFeedUrl || ""}
              onChange={(e) => setProfile({ ...profile, rssFeedUrl: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Right Column: Live Mobile Device Simulator */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="sticky top-20 flex flex-col items-center space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <Smartphone className="w-4 h-4" />
              <span>Live Mobile Preview</span>
            </div>

            {/* Smartphone Shell */}
            <div className="w-[340px] h-[680px] rounded-[44px] border-4 border-slate-800 bg-slate-950 shadow-2xl p-4 overflow-y-auto flex flex-col items-center text-center relative scrollbar-none">
              {/* Speaker Notch */}
              <div className="w-24 h-4 bg-slate-800 rounded-full mb-4 flex-shrink-0" />

              {/* Avatar */}
              <div className="relative mb-3 flex-shrink-0">
                <img
                  src={profile.avatarUrl}
                  alt={profile.displayName}
                  className="w-20 h-20 rounded-full object-cover border-2 border-amber-500/80 shadow"
                />
                {profile.trustScore >= 80 && (
                  <span className="absolute -bottom-1 -right-1 bg-emerald-500 text-slate-950 p-0.5 rounded-full">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>

              {/* Identity */}
              <h3 className="text-base font-bold text-white line-clamp-1">{profile.displayName}</h3>
              <p className="text-[11px] font-mono text-slate-400">@{profile.username}</p>
              {profile.tagline && <p className="text-[11px] text-amber-400 mt-0.5">{profile.tagline}</p>}
              {profile.bio && (
                <p className="text-[11px] text-slate-400 max-w-[240px] mt-1.5 line-clamp-3">
                  {profile.bio}
                </p>
              )}

              {/* Link Buttons */}
              <div className="w-full space-y-2 mt-4 flex-1">
                {profile.links
                  .filter((l) => l.isActive)
                  .map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-900/80 text-xs font-semibold text-slate-200"
                    >
                      <span className="truncate">{link.title}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    </div>
                  ))}

                {profile.rssFeedUrl && (
                  <div className="mt-4 p-2.5 rounded-xl border border-slate-800 bg-slate-900/40 text-left space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                      <Rss className="w-3 h-3 text-amber-500" />
                      <span>Recent Articles</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-300">
                      Sample RSS Post Headline
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Home Indicator Bar */}
              <div className="w-28 h-1 bg-slate-700 rounded-full mt-4 flex-shrink-0" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

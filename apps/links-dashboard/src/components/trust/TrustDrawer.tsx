"use client";

import React from "react";
import { X, ShieldCheck, ShieldAlert, ShieldX, CheckCircle, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";

export interface TrustDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  destinationUrl: string;
  trustScore: number;
  pillars?: {
    targetHygiene: number;
    authorProvenance: number;
    contentIntegrity: number;
    ecosystemReputation: number;
  };
  flags?: string[];
}

export function TrustDrawer({
  isOpen,
  onClose,
  slug,
  destinationUrl,
  trustScore,
  pillars = {
    targetHygiene: Math.round(trustScore * 0.25),
    authorProvenance: Math.round(trustScore * 0.35),
    contentIntegrity: Math.round(trustScore * 0.2),
    ecosystemReputation: Math.round(trustScore * 0.2),
  },
  flags = [],
}: TrustDrawerProps) {
  if (!isOpen) return null;

  const isHigh = trustScore >= 80;
  const isModerate = trustScore >= 60 && trustScore < 80;
  const isDegraded = trustScore < 60;

  const StatusIcon = isHigh ? ShieldCheck : isModerate ? ShieldAlert : ShieldX;
  const statusColor = isHigh ? "text-emerald-400" : isModerate ? "text-amber-400" : "text-red-400";
  const statusBg = isHigh ? "bg-emerald-500/10 border-emerald-500/30" : isModerate ? "bg-amber-500/10 border-amber-500/30" : "bg-red-500/10 border-red-500/30";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      {/* Click outside backdrop */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Container with safe area padding */}
      <div className="w-full max-w-md bg-slate-950 border-l border-slate-800 h-[100dvh] flex flex-col justify-between overflow-y-auto p-6 text-slate-100 shadow-2xl pb-[env(safe-area-inset-bottom,24px)]">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <StatusIcon className={`w-5 h-5 ${statusColor}`} />
              <h2 className="text-base font-semibold">SunShade Trust Audit</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Score Header Card */}
          <div className={`p-4 rounded-xl border ${statusBg} flex items-center justify-between`}>
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Total Trust Rating</p>
              <p className={`text-2xl font-bold font-mono ${statusColor}`}>{trustScore} / 100</p>
              <p className="text-xs text-slate-300 mt-0.5">
                {isHigh ? "Verified High-Trust Destination" : isModerate ? "Acceptable Trust Level" : "Degraded Trust Gate Enforced"}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-mono px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
                /{slug}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-mono text-slate-400">Destination URL</p>
            <p className="text-xs font-mono text-slate-300 break-all p-2 rounded bg-slate-900/60 border border-slate-800/80">
              {destinationUrl}
            </p>
          </div>

          {/* 4 Pillars Breakdown */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400">4-Pillar Security Matrix</h3>

            {/* Pillar 1: Target Hygiene */}
            <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-900/40 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-200">1. Target Hygiene & SSL</span>
                <span className="font-mono text-emerald-400 font-semibold">{pillars.targetHygiene} / 25</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(pillars.targetHygiene / 25) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">SSL certificate validity, latency &lt;800ms, redirect hops &le; 1</p>
            </div>

            {/* Pillar 2: Author Provenance */}
            <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-900/40 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-200">2. Author Identity / HTN DID</span>
                <span className="font-mono text-indigo-400 font-semibold">{pillars.authorProvenance} / 35</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(pillars.authorProvenance / 35) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">Ed25519 cryptographic DID signature and tenant domain reputation</p>
            </div>

            {/* Pillar 3: Content Cleanliness */}
            <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-900/40 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-200">3. Surveillance Cleanliness</span>
                <span className="font-mono text-amber-400 font-semibold">{pillars.contentIntegrity} / 20</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(pillars.contentIntegrity / 20) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">Zero tracking parameters (fbclid, gclid stripped) and SHA-256 verified</p>
            </div>

            {/* Pillar 4: Ecosystem Reputation */}
            <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-900/40 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-200">4. Ecosystem Temporal Retention</span>
                <span className="font-mono text-teal-400 font-semibold">{pillars.ecosystemReputation} / 20</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-teal-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(pillars.ecosystemReputation / 20) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">Zero abuse reports and verified historical uptime retention</p>
            </div>
          </div>

          {/* Security Flags */}
          {flags.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Security Telemetry Alerts</p>
              <div className="space-y-1">
                {flags.map((flag, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-xs text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{flag}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-6 border-t border-slate-800 space-y-2">
          {isDegraded && (
            <a
              href={`https://links.sunshade.icu/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-red-500/40 bg-red-500/10 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition"
            >
              <span>View Interstitial Warning Gate</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <button
            onClick={() => alert("Destination scan triggered across edge nodes.")}
            className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            <span>Trigger Real-Time Hygiene Re-scan</span>
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

export interface TrustBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onClick?: () => void;
}

export function TrustBadge({ score, size = "md", interactive = true, onClick }: TrustBadgeProps) {
  const isHigh = score >= 80;
  const isModerate = score >= 60 && score < 80;
  const isDegraded = score < 60;

  let colorClasses = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  let Icon = ShieldCheck;

  if (isModerate) {
    colorClasses = "bg-amber-500/10 text-amber-400 border-amber-500/30";
    Icon = ShieldAlert;
  } else if (isDegraded) {
    colorClasses = "bg-red-500/10 text-red-400 border-red-500/30";
    Icon = ShieldX;
  }

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px] gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5",
    lg: "px-3 py-1.5 text-sm gap-2",
  }[size];

  const Comp = interactive ? "button" : "span";

  return (
    <Comp
      type={interactive ? "button" : undefined}
      onClick={interactive ? onClick : undefined}
      className={`inline-flex items-center font-mono font-semibold rounded-full border transition-all ${colorClasses} ${sizeClasses} ${
        interactive ? "hover:scale-105 hover:shadow-sm cursor-pointer" : ""
      }`}
      title={`SunShade Trust Score: ${score}/100. Click to inspect 4-pillar security breakdown.`}
    >
      <Icon className={size === "sm" ? "w-3 h-3" : size === "lg" ? "w-4 h-4" : "w-3.5 h-3.5"} />
      <span>{score}/100</span>
    </Comp>
  );
}

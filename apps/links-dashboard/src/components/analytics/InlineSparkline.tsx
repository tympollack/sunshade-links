import React from "react";

export type SparklinePeriod = "24h" | "7d" | "30d" | "all_time";

export interface SparklineTelemetry {
  counts: number[];
  periodSummary?: {
    "24h"?: number;
    "7d"?: number;
    "30d"?: number;
    all_time?: number;
  };
}

export interface InlineSparklineProps {
  data: number[] | SparklineTelemetry;
  width?: number;
  height?: number;
  className?: string;
  showTooltip?: boolean;
}

export type TrendDirection = "upward" | "flat" | "downward";

export function calculateTrend(data: number[]): TrendDirection {
  if (data.length < 2) return "flat";
  const first = data[0];
  const last = data[data.length - 1];
  const max = Math.max(...data);
  const min = Math.min(...data);

  if (max === min) return "flat";
  if (last > first) return "upward";
  if (last < first) return "downward";
  return "flat";
}

export function generateSvgPath(
  data: number[],
  width: number,
  height: number,
  padding = 2
): { pathString: string; areaString: string } {
  if (!data || data.length === 0) {
    return { pathString: "", areaString: "" };
  }

  const effectiveWidth = width - padding * 2;
  const effectiveHeight = height - padding * 2;
  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;

  const points = data.map((val, index) => {
    const x =
      data.length === 1
        ? width / 2
        : padding + (index / (data.length - 1)) * effectiveWidth;
    const y =
      padding + effectiveHeight - ((val - minVal) / range) * effectiveHeight;
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  });

  if (points.length === 1) {
    const pt = points[0];
    const pathString = `M ${pt.x - 2} ${pt.y} L ${pt.x + 2} ${pt.y}`;
    return { pathString, areaString: "" };
  }

  // Smooth line or linear polyline
  let pathString = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    pathString += ` L ${points[i].x} ${points[i].y}`;
  }

  const lastPt = points[points.length - 1];
  const firstPt = points[0];
  const bottomY = height - padding;
  const areaString = `${pathString} L ${lastPt.x} ${bottomY} L ${firstPt.x} ${bottomY} Z`;

  return { pathString, areaString };
}

export function InlineSparkline({
  data,
  width = 64,
  height = 18,
  className = "",
  showTooltip = true,
}: InlineSparklineProps) {
  const counts = Array.isArray(data) ? data : data.counts;
  const periodSummary = !Array.isArray(data) ? data.periodSummary : undefined;

  const trend = calculateTrend(counts);
  const { pathString, areaString } = generateSvgPath(counts, width, height);

  const colors = {
    upward: {
      stroke: "#10B981", // Accent Teal
      gradientStart: "rgba(16, 185, 129, 0.28)",
      gradientEnd: "rgba(16, 185, 129, 0.0)",
    },
    flat: {
      stroke: "#64748B", // Muted Slate
      gradientStart: "transparent",
      gradientEnd: "transparent",
    },
    downward: {
      stroke: "#F59E0B", // Amber
      gradientStart: "rgba(245, 158, 11, 0.25)",
      gradientEnd: "rgba(245, 158, 11, 0.0)",
    },
  }[trend];

  const gradientId = React.useId();
  const total = counts.reduce((sum, n) => sum + n, 0);

  return (
    <div
      className={`group relative inline-flex items-center ${className}`}
      data-testid="inline-sparkline"
      data-trend={trend}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        aria-label={`Telemetry trend: ${trend}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.gradientStart} />
            <stop offset="100%" stopColor={colors.gradientEnd} />
          </linearGradient>
        </defs>

        {trend !== "flat" && areaString && (
          <path d={areaString} fill={`url(#${gradientId})`} />
        )}

        <path
          d={pathString}
          fill="none"
          stroke={colors.stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {showTooltip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-100 shadow-lg group-hover:block z-20"
        >
          {periodSummary ? (
            <div className="flex gap-2">
              {periodSummary["24h"] !== undefined && (
                <span>24h: {periodSummary["24h"]}</span>
              )}
              {periodSummary["7d"] !== undefined && (
                <span>7d: {periodSummary["7d"]}</span>
              )}
              {periodSummary["30d"] !== undefined && (
                <span>30d: {periodSummary["30d"]}</span>
              )}
              {periodSummary.all_time !== undefined && (
                <span className="font-semibold">All: {periodSummary.all_time}</span>
              )}
            </div>
          ) : (
            <span>Total: {total} clicks ({trend})</span>
          )}
        </div>
      )}
    </div>
  );
}

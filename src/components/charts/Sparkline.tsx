"use client";

import { memo } from "react";

/**
 * Minimal SVG sparkline — shows a trend line for account balance history.
 * Reused from the DANEX Control prototype (charts.jsx).
 *
 * Values are assumed to be in the range [0, max] and are normalized to fit
 * the SVG viewBox.  Works well with 5–30 data points.
 */
type Props = {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
};

export const Sparkline = memo(function Sparkline({
  values,
  width = 76,
  height = 28,
  className,
}: Props) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = values.length;
  const pad = 3;

  const x = (i: number) => (i / (n - 1)) * (width - pad * 2) + pad;
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);

  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");

  const up = values[values.length - 1] >= values[0];
  const stroke = up ? "rgba(10,138,79,0.65)" : "rgba(214,49,43,0.65)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ display: "block", flexShrink: 0 }}
    >
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

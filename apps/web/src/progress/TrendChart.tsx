import { useState } from 'react';
import type { ChartPoint } from '@atlas/progress-engine';

interface TrendChartProps {
  points: ChartPoint[];
  unit?: string;
  formatValue?: (value: number) => string;
}

// ponytail: hand-rolled SVG rather than a charting dependency -- the chart
// needs here (a handful of simple trend lines over sparse, personal-scale
// data) don't justify one. Revisit if requirements grow (zoom/pan, log
// scales, thousands of points). See docs/PRS.md "Charts."
const WIDTH = 600;
const HEIGHT = 200;
const PADDING_X = 12;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 28;

function formatDateShort(iso: string): string {
  // Date-only strings ("YYYY-MM-DD", e.g. BodyMeasurement.date) must not go
  // through the UTC-midnight parse `new Date(iso)` gives them -- in any
  // timezone behind UTC, that renders as the PREVIOUS day once
  // toLocaleDateString converts back to local time. Full timestamps
  // (WorkoutSession.completed_at) are unambiguous and parse the same either way.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const date = dateOnly ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** A single-metric line chart: date on x, value on y. Handles 0/1/N points. */
export function TrendChart({ points, unit = '', formatValue }: TrendChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const format = formatValue ?? ((v: number) => `${Math.round(v * 10) / 10}${unit}`);

  if (points.length === 0) {
    return <p className="atlas-trend-chart__empty">Not enough data yet.</p>;
  }

  if (points.length === 1) {
    const only = points[0];
    if (!only) return null;
    return (
      <div className="atlas-trend-chart atlas-trend-chart--single">
        <span className="atlas-trend-chart__single-value">{format(only.value)}</span>
        <span className="atlas-trend-chart__single-date">{formatDateShort(only.date)}</span>
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1; // every point equal -- avoid divide-by-zero, draw a flat line

  const plotWidth = WIDTH - PADDING_X * 2;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  function xFor(index: number): number {
    return PADDING_X + (index / (points.length - 1)) * plotWidth;
  }
  function yFor(value: number): number {
    return PADDING_TOP + plotHeight - ((value - min) / range) * plotHeight;
  }

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.value)}`)
    .join(' ');
  const first = points[0];
  const lastPoint = points[points.length - 1];
  const active = activeIndex != null ? points[activeIndex] : undefined;

  return (
    <div className="atlas-trend-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Trend over ${points.length} sessions, from ${format(min)} to ${format(max)}`}
      >
        <path d={linePath} className="atlas-trend-chart__line" fill="none" />
        {points.map((p, i) => (
          <circle
            key={p.sessionId}
            cx={xFor(i)}
            cy={yFor(p.value)}
            r={activeIndex === i ? 6 : 4}
            className="atlas-trend-chart__point"
            tabIndex={0}
            onClick={() => setActiveIndex((prev) => (prev === i ? null : i))}
            onFocus={() => setActiveIndex(i)}
          >
            <title>{`${formatDateShort(p.date)}: ${format(p.value)}`}</title>
          </circle>
        ))}
        {first && (
          <text
            x={xFor(0)}
            y={HEIGHT - 8}
            className="atlas-trend-chart__axis-label"
            textAnchor="start"
          >
            {formatDateShort(first.date)}
          </text>
        )}
        {lastPoint && (
          <text
            x={xFor(points.length - 1)}
            y={HEIGHT - 8}
            className="atlas-trend-chart__axis-label"
            textAnchor="end"
          >
            {formatDateShort(lastPoint.date)}
          </text>
        )}
      </svg>
      <p className="atlas-trend-chart__tooltip" aria-live="polite">
        {active ? (
          <>
            {formatDateShort(active.date)}: <strong>{format(active.value)}</strong>
          </>
        ) : (
          ' '
        )}
      </p>
    </div>
  );
}

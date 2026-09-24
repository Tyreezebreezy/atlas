import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ChartPoint } from '@atlas/progress-engine';

interface TrendChartProps {
  points: ChartPoint[];
  unit?: string;
  formatValue?: (value: number) => string;
  /** Indices of points that set a new best; drawn as ringed markers. */
  recordIndices?: number[];
  /**
   * A visually secondary series (e.g. the 7-day average), lined up with
   * `points` by `sessionId`. Drawn thin and dashed, never with markers.
   */
  secondary?: { points: ChartPoint[]; label: string };
  /** Accessible name of the chart, e.g. "Reps @ 170 lb". */
  title?: string;
  /** Evenly spaced by entry (training sessions) or in proportion to the calendar (body weight). */
  xScale?: 'index' | 'date';
  /** Label the latest point with its value. Off where a headline number already says so (Body). */
  showLastValue?: boolean;
  /** Narrowest y-range to draw, in the series' own units, so small noise is not stretched into a trend. */
  minSpan?: number;
}

// ponytail: hand-rolled SVG rather than a charting dependency -- the chart
// needs here (a handful of simple trend lines over sparse, personal-scale
// data) don't justify one. Revisit if requirements grow (zoom/pan, log
// scales, thousands of points). See docs/PRS.md "Charts."
//
// vNext Handoff 03B: drawn at the container's real pixel width (not scaled
// from a fixed 600-unit canvas), so axis labels stay a true 11-12px on a
// phone instead of shrinking with the drawing.
const HEIGHT = 200;
const PAD = { right: 16, top: 22, bottom: 30 };
const FALLBACK_WIDTH = 320;

/** `mounted`: the measured element only exists once there is a chart to draw, so re-measure when that flips. */
function useElementWidth(ref: RefObject<HTMLElement | null>, mounted: boolean): number {
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useEffect(() => {
    const el = ref.current;
    if (!el || !mounted) return;
    const measure = () => setWidth(Math.max(200, Math.round(el.clientWidth)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, mounted]);
  return width;
}

function parseDate(iso: string): Date {
  // Date-only strings ("YYYY-MM-DD", e.g. BodyMeasurement.date) must not go
  // through the UTC-midnight parse `new Date(iso)` gives them -- in any
  // timezone behind UTC, that renders as the PREVIOUS day once
  // toLocaleDateString converts back to local time. Full timestamps
  // (WorkoutSession.completed_at) are unambiguous and parse the same either way.
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
}

function formatDateShort(iso: string): string {
  return parseDate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** A single-metric line chart: date on x, value on y. Handles 0/1/N points. */
export function TrendChart({
  points,
  unit = '',
  formatValue,
  recordIndices = [],
  secondary,
  title,
  xScale = 'index',
  showLastValue = true,
  minSpan,
}: TrendChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(wrapRef, points.length >= 2);
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

  const indexById = new Map(points.map((p, i) => [p.sessionId, i]));
  const secondaryPoints = (secondary?.points ?? []).filter((p) => indexById.has(p.sessionId));

  const values = [...points.map((p) => p.value), ...secondaryPoints.map((p) => p.value)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  // The visible range is never narrower than `minSpan`: without it a 0.6 lb wobble in body weight
  // is auto-zoomed until it looks like a cliff.
  const span = Math.max(max - min, minSpan ?? 0);
  const middle = (min + max) / 2;
  const pad = span > 0 ? span * 0.12 : Math.max(1, Math.abs(max) * 0.05);
  const yMin = middle - span / 2 - pad;
  const yMax = middle + span / 2 + pad;

  // The y-axis labels are the widest thing left of the plot: make room for them (11px digits ~6.4px).
  const padLeft = Math.max(36, Math.ceil(Math.max(format(max).length, format(min).length) * 6.4) + 14);
  const plotWidth = width - padLeft - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const times = points.map((p) => parseDate(p.date).getTime());
  const t0 = times[0] ?? 0;
  const t1 = times[times.length - 1] ?? 1;
  function xFor(index: number): number {
    const fraction =
      xScale === 'date' && t1 > t0
        ? ((times[index] ?? t0) - t0) / (t1 - t0)
        : index / (points.length - 1);
    return padLeft + fraction * plotWidth;
  }
  function yFor(value: number): number {
    return PAD.top + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight;
  }

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.value)}`).join(' ');
  const areaPath = `${linePath} L ${xFor(points.length - 1)} ${PAD.top + plotHeight} L ${xFor(0)} ${PAD.top + plotHeight} Z`;
  const secondaryPath = secondaryPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(indexById.get(p.sessionId) as number)} ${yFor(p.value)}`)
    .join(' ');

  const first = points[0];
  const last = points[points.length - 1];
  const active = activeIndex != null ? points[activeIndex] : undefined;
  const records = new Set(recordIndices);
  const lastX = xFor(points.length - 1);
  const summary =
    `${title ? `${title}: ` : ''}${points.length} entries, from ${format(first?.value ?? 0)} to ` +
    `${format(last?.value ?? 0)} (lowest ${format(min)}, highest ${format(max)})` +
    (records.size > 0 ? `; ${records.size} new best${records.size === 1 ? '' : 's'}` : '');

  return (
    <div className="atlas-trend-chart" ref={wrapRef}>
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} role="img" aria-label={summary}>
        {[max, (max + min) / 2, min].map((value, i) => (
          <g key={i}>
            <line
              x1={padLeft}
              x2={width - PAD.right}
              y1={yFor(value)}
              y2={yFor(value)}
              className="atlas-trend-chart__grid"
            />
            {i !== 1 && (
              <text
                x={padLeft - 8}
                y={yFor(value) + 4}
                className="atlas-trend-chart__axis-label"
                textAnchor="end"
              >
                {format(value)}
              </text>
            )}
          </g>
        ))}
        <path d={areaPath} className="atlas-trend-chart__area" />
        {secondaryPath && <path d={secondaryPath} className="atlas-trend-chart__secondary" fill="none" />}
        <path d={linePath} className="atlas-trend-chart__line" fill="none" />
        {points.map((p, i) => (
          <g key={p.sessionId}>
            {records.has(i) && (
              <circle cx={xFor(i)} cy={yFor(p.value)} r={7.5} className="atlas-trend-chart__record" />
            )}
            <circle
              cx={xFor(i)}
              cy={yFor(p.value)}
              r={activeIndex === i ? 5.5 : 3.5}
              className="atlas-trend-chart__point"
              tabIndex={0}
              aria-label={`${formatDateShort(p.date)}: ${format(p.value)}${records.has(i) ? ', new best' : ''}`}
              onClick={() => setActiveIndex((prev) => (prev === i ? null : i))}
              onFocus={() => setActiveIndex(i)}
              onBlur={() => setActiveIndex((prev) => (prev === i ? null : prev))}
            >
              <title>{`${formatDateShort(p.date)}: ${format(p.value)}`}</title>
            </circle>
          </g>
        ))}
        {last && showLastValue && (
          <text
            x={lastX}
            y={yFor(last.value) - 12}
            className="atlas-trend-chart__value-label"
            textAnchor={lastX > width - PAD.right - 28 ? 'end' : 'middle'}
          >
            {format(last.value)}
          </text>
        )}
        {first && (
          <text x={padLeft} y={HEIGHT - 8} className="atlas-trend-chart__axis-label" textAnchor="start">
            {formatDateShort(first.date)}
          </text>
        )}
        {last && (
          <text x={width - PAD.right} y={HEIGHT - 8} className="atlas-trend-chart__axis-label" textAnchor="end">
            {formatDateShort(last.date)}
          </text>
        )}
      </svg>
      <p className="atlas-trend-chart__tooltip" aria-live="polite">
        {active ? (
          <>
            {formatDateShort(active.date)}: <strong>{format(active.value)}</strong>
            {records.has(activeIndex as number) ? ' · new best' : ''}
          </>
        ) : (
          ' '
        )}
      </p>
      {(records.size > 0 || secondaryPath) && (
        <p className="atlas-trend-chart__legend">
          {records.size > 0 && (
            <span>
              <i className="atlas-trend-chart__legend-record" aria-hidden="true" /> New best
            </span>
          )}
          {secondaryPath && (
            <span>
              <i className="atlas-trend-chart__legend-secondary" aria-hidden="true" /> {secondary?.label}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/** Mirrors tokens.css for JS-side consumers (charts, canvas, inline styles). */
export const atlasColors = {
  background: '#0B0D10',
  surface: '#15191E',
  surfaceRaised: '#242B33',
  textPrimary: '#F2F4F7',
  textSecondary: '#9AA5B1',
  accent: '#3B9EFF',
  accentMist: '#193049',
  success: '#3DDC84',
  timer: '#22D3EE',
  warning: '#F5A524',
  danger: '#FF6B6B',
  milestone: '#D9A441',
  border: '#626D79',
  /** v1.0.0 (H1) — interaction surface tints (not text colors). */
  hover: '#2A333D',
  pressed: '#1A2026',
  textDisabled: '#5A6571',
} as const;

export type AtlasColor = keyof typeof atlasColors;

/** v1.0.0 (H1) — ordered data-viz series palette (mirrors tokens.css). */
export const chartSeries = [
  '#3B9EFF',
  '#22D3EE',
  '#3DDC84',
  '#D9A441',
  '#F5A524',
  '#FF6B6B',
] as const;

export const chartNeutrals = {
  grid: '#262E37',
  axis: '#9AA5B1',
} as const;

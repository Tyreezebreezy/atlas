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
} as const;

export type AtlasColor = keyof typeof atlasColors;

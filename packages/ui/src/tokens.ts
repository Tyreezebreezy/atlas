/** Mirrors tokens.css for JS-side consumers (charts, canvas, inline styles). */
export const atlasColors = {
  background: '#F2F0EA',
  surface: '#FAF9F6',
  textPrimary: '#252A2D',
  textSecondary: '#626B70',
  sage: '#557568',
  sageMist: '#DCE6E0',
  bronze: '#B77A3F',
  success: '#477058',
  timer: '#526F91',
  warning: '#B6664B',
  border: '#D8D5CD',
} as const;

export type AtlasColor = keyof typeof atlasColors;

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BodyMap, type BodyMapMuscleState } from './BodyMap';

// The web tests run in a node environment (no DOM), so the renderer is exercised through its
// server-rendered markup -- enough to pin what it paints, which is all it is responsible for.
function render(props: Parameters<typeof BodyMap>[0]): string {
  return renderToStaticMarkup(createElement(BodyMap, props));
}

/** The opening tag of the region whose accessible name is `label`. */
function regionTag(html: string, label: string): string {
  const match = html.match(new RegExp(`<g [^>]*aria-label="${label.replace('/', '\\/')}"[^>]*>`));
  if (!match) throw new Error(`No region labelled "${label}"`);
  return match[0];
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('BodyMap — front / back', () => {
  it('draws the front figure by default, with a Front/Back toggle', () => {
    const html = render({ states: [] });
    expect(html).toContain('viewBox="0 0 35 93"');
    expect(html).toContain('aria-label="Front view of the body"');
    expect(html).toContain('>Front<');
    expect(html).toContain('>Back<');
  });

  it('can be fixed to one side, which removes the toggle (thumbnails)', () => {
    const html = render({ states: [], view: 'back' });
    expect(html).toContain('viewBox="37 0 35 93"');
    expect(html).toContain('aria-label="Back view of the body"');
    expect(html).not.toContain('atlas-body-map__toggle');
  });

  it('takes a custom accessible name for the figure', () => {
    expect(render({ states: [], view: 'front', ariaLabel: 'Chest trained most' })).toContain(
      'aria-label="Chest trained most"',
    );
  });
});

describe('BodyMap — accessible names and interaction', () => {
  it('is a plain image (no tab stops) until it is given a selection handler', () => {
    const html = render({ states: [] });
    expect(html).toContain('role="img"');
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain('tabindex');
  });

  it('makes each region one named, keyboard-reachable button when interactive', () => {
    const html = render({ states: [], onSelectRegion: () => {} });
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Upper Chest"');
    expect(html).toContain('aria-label="Lower Chest / Mid Chest"');
    expect(count(html, 'role="button"')).toBe(count(html, 'tabindex="0"'));
    // One stop per region, not one per upstream sub-shape.
    expect(count(html, 'role="button"')).toBeLessThanOrEqual(15);
  });

  it('names a shared region for everything it represents, so a screen reader is not misled', () => {
    const html = render({ states: [], view: 'back', onSelectRegion: () => {} });
    expect(html).toContain('aria-label="Traps / Mid-Back / Rhomboids"');
  });
});

describe('BodyMap — selection mode (Library) vs analytics mode (Progress)', () => {
  const chest = (extra: Partial<BodyMapMuscleState>): BodyMapMuscleState => ({
    muscleId: 'chest.upper',
    state: 'heat',
    ...extra,
  });

  it('selection mode: a selected muscle is filled AND outlined AND announced as pressed', () => {
    const html = render({
      states: [chest({ state: 'selected' })],
      onSelectRegion: () => {},
    });
    const tag = regionTag(html, 'Upper Chest');
    expect(tag).toContain('atlas-body-map__region--selected');
    expect(tag).toContain('aria-pressed="true"');
    expect(count(html, 'class="atlas-body-map__outline"')).toBeGreaterThan(0);
    expect(regionTag(html, 'Lower Chest / Mid Chest')).toContain('aria-pressed="false"');
  });

  it('analytics mode: a selected heat region keeps its heat fill and only gains the outline', () => {
    const html = render({
      states: [chest({ state: 'heat', intensity: 0.5, selected: true })],
      onSelectRegion: () => {},
    });
    const tag = regionTag(html, 'Upper Chest');
    expect(tag).toContain('atlas-body-map__region--heat');
    expect(tag).not.toContain('atlas-body-map__region--selected');
    expect(tag).toContain('aria-pressed="true"');
    expect(count(html, 'class="atlas-body-map__outline"')).toBeGreaterThan(0);
  });

  it('draws no outline at all when nothing is selected', () => {
    const html = render({ states: [chest({ intensity: 1 })], onSelectRegion: () => {} });
    expect(count(html, 'class="atlas-body-map__outline"')).toBe(0);
  });
});

describe('BodyMap — intensity, assist and tone inputs', () => {
  it('turns a 0..1 intensity into the heat ramp variable (25% floor, so light work is still visible)', () => {
    const at = (intensity: number) =>
      regionTag(
        render({ states: [{ muscleId: 'chest.upper', state: 'heat', intensity }], onSelectRegion: () => {} }),
        'Upper Chest',
      );
    expect(at(0)).toContain('--atlas-heat:0.25');
    expect(at(1)).toContain('--atlas-heat:1');
    expect(at(0.5)).toContain('--atlas-heat:0.625');
  });

  it('paints assist and each performance tone with its own class', () => {
    const html = render({
      states: [
        { muscleId: 'arms.forearm_flexors', state: 'assist' },
        { muscleId: 'chest.upper', state: 'tone', tone: 'positive' },
        { muscleId: 'core.rectus_abdominis', state: 'tone', tone: 'caution' },
        { muscleId: 'quads.quadriceps', state: 'tone', tone: 'muted' },
      ],
      onSelectRegion: () => {},
    });
    expect(regionTag(html, 'Forearms')).toContain('atlas-body-map__region--assist');
    expect(regionTag(html, 'Upper Chest')).toContain('atlas-body-map__region--tone-positive');
    expect(regionTag(html, 'Abs')).toContain('atlas-body-map__region--tone-caution');
    expect(regionTag(html, 'Quadriceps')).toContain('atlas-body-map__region--tone-muted');
  });

  it('when muscles share a region the strongest state wins, whatever the input order', () => {
    // Front, lateral and rear deltoids all live in one deltoid region.
    const states: BodyMapMuscleState[] = [
      { muscleId: 'shoulders.anterior', state: 'heat', intensity: 0.2 },
      { muscleId: 'shoulders.lateral', state: 'heat', intensity: 0.9 },
    ];
    for (const ordered of [states, [...states].reverse()]) {
      expect(regionTag(render({ states: ordered, onSelectRegion: () => {} }), 'Shoulders')).toContain(
        '--atlas-heat:0.925',
      );
    }
  });

  it('when tones share a region attention wins: stalled over progressing', () => {
    const states: BodyMapMuscleState[] = [
      { muscleId: 'shoulders.anterior', state: 'tone', tone: 'positive' },
      { muscleId: 'shoulders.lateral', state: 'tone', tone: 'caution' },
    ];
    for (const ordered of [states, [...states].reverse()]) {
      expect(regionTag(render({ states: ordered, onSelectRegion: () => {} }), 'Shoulders')).toContain(
        'atlas-body-map__region--tone-caution',
      );
    }
  });

  it('ignores a muscle id that is not in the taxonomy instead of throwing', () => {
    expect(() => render({ states: [{ muscleId: 'not.a.muscle', state: 'primary' }] })).not.toThrow();
  });
});

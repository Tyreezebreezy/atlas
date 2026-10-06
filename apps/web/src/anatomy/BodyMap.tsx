import { useId, useState, type CSSProperties } from 'react';
import { getMuscle } from '@atlas/anatomy';
import { VIEW_LAYOUTS, type BodyView, type RegionGroup } from './anatomyMapping';

/**
 * v1.0.0 (H2), rebuilt in vNext Handoff 03B on vendored anatomical geometry.
 *
 * This component only PAINTS. It owns no training analytics: callers hand it
 * per-muscle states (already normalized -- `intensity` is 0..1) and it draws
 * them. Which upstream shape represents which ATLAS muscle is decided in
 * anatomyMapping.ts (documented, audited, tested); the geometry is in
 * vendoredMuscleShapes.ts (see NOTICE.md for provenance/license). Nothing
 * from the upstream package's own renderer or color scale is used.
 *
 * Shapes are grouped per ATLAS region, so keyboard and screen-reader users
 * get one stop per region ("Traps"), not one per upstream sub-shape.
 *
 * Two visual vocabularies share this one renderer and must stay distinct:
 * - SELECTION (Library, exercise editor): `primary` / `secondary` / `selected`
 *   -- a solid fill that says "this is the one you picked".
 * - ANALYTICS (Progress > Muscles): `heat` (intensity ramp), `assist`
 *   (assisted only, never converted into heat) or `tone` (categorical), with `selected: true` adding only an outline so the
 *   region keeps its analytic fill.
 */

export type BodyMapState = 'idle' | 'primary' | 'secondary' | 'selected' | 'heat' | 'assist' | 'tone';

/** Categorical fills for `tone`. Each also has a non-color cue in CSS (fill
 * pattern / outline style), so meaning never rests on hue alone. */
export type BodyMapTone = 'positive' | 'neutral' | 'caution' | 'muted';

export interface BodyMapMuscleState {
  muscleId: string;
  state: BodyMapState;
  /** 0..1 intensity for 'heat' (exposure). Ignored for other states. */
  intensity?: number;
  /** Required for 'tone'. */
  tone?: BodyMapTone;
  /** Outline this region as the current selection without changing its fill. */
  selected?: boolean;
}

interface BodyMapProps {
  /** Muscle states keyed by muscle id; the component maps each to its region(s). */
  states: BodyMapMuscleState[];
  /**
   * When provided, regions become keyboard/touch selectable buttons.
   * `muscleIds` is every canonical ATLAS muscle the tapped region represents
   * -- a shared/fallback region (e.g. the sternal pec, which is both Lower
   * and Mid Chest) represents more than its own svg_id, so prefer it over
   * `musclesForSvgId(svgId)`.
   */
  onSelectRegion?: (svgId: string, muscleIds: string[]) => void;
  /** Fixes the figure to one side and hides the Front/Back toggle (thumbnails). */
  view?: BodyView;
  /** Accessible name of the figure; defaults to "Front/Back view of the body". */
  ariaLabel?: string;
  className?: string;
}

function rank(state: BodyMapState): number {
  if (state === 'idle') return 0; // carries only `selected` -- no fill of its own
  if (state === 'selected') return 3;
  if (state === 'primary' || state === 'heat' || state === 'tone') return 2;
  return 1; // secondary
}

/** Merge order for tones that share one region: attention first, matching the performance rollup. */
const TONE_RANK: Record<BodyMapTone, number> = { caution: 3, positive: 2, neutral: 1, muted: 0 };

/**
 * Strongest state wins; on a tie the higher intensity (or tone) wins;
 * otherwise the first stays -- so the result never depends on array order.
 * Used both to merge muscles that share one region and regions that share
 * one shape.
 */
function strongerState(
  a: BodyMapMuscleState | undefined,
  b: BodyMapMuscleState | undefined,
): BodyMapMuscleState | undefined {
  if (!a) return b;
  if (!b) return a;
  const merge = (winner: BodyMapMuscleState, other: BodyMapMuscleState): BodyMapMuscleState =>
    winner.selected || other.selected ? { ...winner, selected: true } : winner;
  const byRank = rank(b.state) - rank(a.state);
  if (byRank !== 0) return byRank > 0 ? merge(b, a) : merge(a, b);
  if (a.state === 'tone' && b.state === 'tone') {
    const byTone = TONE_RANK[b.tone ?? 'muted'] - TONE_RANK[a.tone ?? 'muted'];
    if (byTone !== 0) return byTone > 0 ? merge(b, a) : merge(a, b);
  }
  return (b.intensity ?? 0) > (a.intensity ?? 0) ? merge(b, a) : merge(a, b);
}

/**
 * Which side to open on: the one with more lit regions, so an exercise worked from behind (a row, a leg curl, a hip
 * abduction) or a back day's summary does not open on an empty front figure. A tie, or nothing lit, opens on the front.
 */
function sideToOpenOn(states: BodyMapMuscleState[]): BodyView {
  const lit = new Set<string>();
  for (const s of states) {
    const muscle = getMuscle(s.muscleId);
    if (muscle && (s.state !== 'idle' || s.selected)) lit.add(muscle.svg_id);
  }
  const shown = (view: BodyView) => VIEW_LAYOUTS[view].groups.filter((g) => g.svgIds.some((id) => lit.has(id))).length;
  return shown('back') > shown('front') ? 'back' : 'front';
}

export function BodyMap({ states, onSelectRegion, view: fixedView, ariaLabel, className }: BodyMapProps) {
  const [chosenView, setChosenView] = useState<BodyView>(() => sideToOpenOn(states));
  const view = fixedView ?? chosenView;
  // Per-instance pattern id: two figures on one page must not depend on each other's <defs>.
  const hatchId = `atlas-hatch-${useId().replace(/:/g, '')}`;
  const interactive = !!onSelectRegion;

  // ATLAS svg_id -> merged state of every muscle in that region.
  const bySvgId = new Map<string, BodyMapMuscleState>();
  for (const s of states) {
    const muscle = getMuscle(s.muscleId);
    if (!muscle) continue;
    bySvgId.set(muscle.svg_id, strongerState(bySvgId.get(muscle.svg_id), s) ?? s);
  }

  const layout = view === 'front' ? VIEW_LAYOUTS.front : VIEW_LAYOUTS.back;

  function stateFor(group: RegionGroup): BodyMapMuscleState | undefined {
    return group.svgIds.reduce<BodyMapMuscleState | undefined>(
      (acc, svgId) => strongerState(acc, bySvgId.get(svgId)),
      undefined,
    );
  }

  return (
    <div className={`atlas-body-map${className ? ` ${className}` : ''}`}>
      {!fixedView && (
        <div className="atlas-body-map__toolbar" role="group" aria-label="Body view">
          <button
            type="button"
            className={
              view === 'front'
                ? 'atlas-body-map__toggle atlas-body-map__toggle--active'
                : 'atlas-body-map__toggle'
            }
            aria-pressed={view === 'front'}
            onClick={() => setChosenView('front')}
          >
            Front
          </button>
          <button
            type="button"
            className={
              view === 'back'
                ? 'atlas-body-map__toggle atlas-body-map__toggle--active'
                : 'atlas-body-map__toggle'
            }
            aria-pressed={view === 'back'}
            onClick={() => setChosenView('back')}
          >
            Back
          </button>
        </div>
      )}
      <svg
        viewBox={layout.viewBox}
        role={interactive ? 'group' : 'img'}
        aria-label={ariaLabel ?? (view === 'front' ? 'Front view of the body' : 'Back view of the body')}
        className="atlas-body-map__svg"
        style={{ '--atlas-hatch': `url(#${hatchId})` } as CSSProperties}
      >
        <defs>
          {/* Stalled (performance mode): diagonal hatch -- a cue that isn't hue. */}
          <pattern
            id={hatchId}
            width="1.4"
            height="1.4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="1.4" height="1.4" style={{ fill: 'var(--atlas-color-warning)' }} />
            <rect width="0.55" height="1.4" style={{ fill: 'var(--atlas-color-background)' }} />
          </pattern>
        </defs>
        <g className="atlas-body-map__figure">
          {/* Head, hands, feet, joints, unused muscles: part of the figure, never colored or interactive. */}
          {layout.decorative.map((shape) => (
            <path key={shape.id} d={shape.d} className="atlas-body-map__decorative" />
          ))}
          {layout.groups.map((group) => {
            const entry = stateFor(group);
            const classes = ['atlas-body-map__region'];
            if (entry) classes.push(`atlas-body-map__region--${entry.state}`);
            if (entry?.state === 'tone') classes.push(`atlas-body-map__region--tone-${entry.tone ?? 'muted'}`);
            // Heat is an idle->heat color ramp (see App.css), not transparency, so an outlined
            // region keeps a fully opaque outline however faint its fill.
            const heatStyle =
              entry?.state === 'heat' && entry.intensity != null
                ? ({ '--atlas-heat': String(0.25 + 0.75 * entry.intensity) } as CSSProperties)
                : undefined;
            const isSelected = entry?.state === 'selected' || !!entry?.selected;
            return (
              <g
                key={group.key}
                className={classes.join(' ')}
                style={heatStyle}
                role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={interactive ? group.label : undefined}
                aria-pressed={interactive ? isSelected : undefined}
                onClick={
                  onSelectRegion
                    ? () => onSelectRegion(group.svgIds[0] as string, group.muscleIds)
                    : undefined
                }
                onKeyDown={
                  onSelectRegion
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectRegion(group.svgIds[0] as string, group.muscleIds);
                        }
                      }
                    : undefined
                }
              >
                {group.shapes.map((shape) => (
                  <path key={shape.id} d={shape.d}>
                    <title>{shape.name}</title>
                  </path>
                ))}
              </g>
            );
          })}
          {/* Selection outline, drawn last so a neighbor's gap-stroke can never paint over it, and
              without reordering the focusable regions above. Never the only cue: aria-pressed and
              (in selection mode) the fill change carry it too. */}
          <g className="atlas-body-map__outlines" aria-hidden="true">
            {layout.groups
              .filter((group) => {
                const entry = stateFor(group);
                return entry?.state === 'selected' || !!entry?.selected;
              })
              .flatMap((group) =>
                group.shapes.map((shape) => (
                  <path key={`outline-${shape.id}`} d={shape.d} className="atlas-body-map__outline" />
                )),
              )}
          </g>
        </g>
      </svg>
    </div>
  );
}

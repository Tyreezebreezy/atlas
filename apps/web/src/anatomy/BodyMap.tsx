import { useState } from 'react';
import type { BodyRegion } from '@atlas/data-model';
import { getMuscle } from '@atlas/anatomy';

/**
 * v1.0.0 (H2). ATLAS-owned anatomical Body Map: a stylized, maintainable SVG
 * figure (front + back) whose regions are independently addressable by
 * `svg_id` (the same id the muscle taxonomy uses). Data-driven -- it takes
 * per-muscle states as props and owns no Workout/Program logic.
 *
 * Stylized rather than medical: recognizable shapes with generous invisible
 * touch targets (inflated transparent stroke in CSS), so tiny regions stay
 * tappable on a phone.
 */

export type BodyMapState = 'primary' | 'secondary' | 'selected' | 'heat';

export interface BodyMapMuscleState {
  muscleId: string;
  state: BodyMapState;
  /** 0..1 intensity for 'heat' (exposure). Ignored for other states. */
  intensity?: number;
}

interface BodyMapProps {
  /** Muscle states keyed by muscle id; the component maps each to its svg region. */
  states: BodyMapMuscleState[];
  /** When provided, regions become keyboard/touch selectable buttons. */
  onSelectRegion?: (svgId: string) => void;
  className?: string;
}

interface RegionShape {
  svgId: string;
  d: string;
  label: string;
}

// Each region is one symmetric shape drawn across the figure midline
// (x=100). Chunky on purpose so touch targets stay usable on a phone.
const FRONT_REGIONS: RegionShape[] = [
  { svgId: 'deltoid', label: 'Shoulders', d: 'M44 52 Q40 74 52 82 L64 76 L64 48 Q56 42 44 52 Z' },
  { svgId: 'chest-upper', label: 'Upper Chest', d: 'M56 50 Q100 42 144 50 L144 66 L56 66 Z' },
  { svgId: 'chest-mid', label: 'Mid Chest', d: 'M54 66 Q100 60 146 66 L146 88 L54 88 Z' },
  { svgId: 'chest-lower', label: 'Lower Chest', d: 'M56 88 Q100 84 144 88 L144 106 L56 106 Z' },
  { svgId: 'serratus', label: 'Serratus Anterior', d: 'M52 96 L64 96 L64 116 L52 112 Z' },
  { svgId: 'abs', label: 'Abs', d: 'M72 106 Q100 102 128 106 L128 158 L72 158 Z' },
  { svgId: 'obliques', label: 'Obliques', d: 'M56 110 L72 110 L72 158 L56 154 Z' },
  { svgId: 'biceps', label: 'Biceps', d: 'M42 78 Q40 100 48 118 L60 116 L60 80 Z' },
  { svgId: 'forearms', label: 'Forearms', d: 'M46 122 L58 120 L58 158 L46 158 Z' },
  { svgId: 'hip-flexors', label: 'Hip Flexors', d: 'M70 160 L90 160 L90 178 L70 176 Z' },
  { svgId: 'adductors', label: 'Adductors', d: 'M86 172 L114 172 L114 200 L86 200 Z' },
  { svgId: 'quads', label: 'Quadriceps', d: 'M62 172 Q60 210 66 244 L94 244 L94 172 Z' },
  { svgId: 'tibialis', label: 'Tibialis Anterior', d: 'M66 262 L94 262 L94 292 L66 292 Z' },
];

const BACK_REGIONS: RegionShape[] = [
  { svgId: 'deltoid', label: 'Rear Deltoid', d: 'M44 52 Q40 74 52 82 L64 76 L64 48 Q56 42 44 52 Z' },
  { svgId: 'traps', label: 'Traps', d: 'M64 44 Q100 36 136 44 L132 64 L68 64 Z' },
  { svgId: 'mid-back', label: 'Mid-Back / Rhomboids', d: 'M62 66 Q100 60 138 66 L138 92 L62 92 Z' },
  { svgId: 'lats', label: 'Lats', d: 'M56 66 L62 66 L62 122 L52 120 Z' },
  { svgId: 'erectors', label: 'Spinal Erectors', d: 'M94 66 L106 66 L106 158 L94 158 Z' },
  { svgId: 'triceps', label: 'Triceps', d: 'M42 78 Q40 100 48 118 L60 116 L60 80 Z' },
  { svgId: 'forearms', label: 'Forearm Extensors', d: 'M46 122 L58 120 L58 158 L46 158 Z' },
  { svgId: 'glutes', label: 'Glutes', d: 'M58 164 Q100 156 142 164 L142 196 Q100 202 58 196 Z' },
  { svgId: 'abductors', label: 'Abductors', d: 'M58 196 L74 196 L74 240 L60 238 Z' },
  { svgId: 'hamstrings', label: 'Hamstrings', d: 'M66 172 Q64 210 70 246 L92 246 L92 172 Z' },
  { svgId: 'calves', label: 'Calves', d: 'M66 252 L94 252 L94 296 Q92 304 80 304 L66 300 Z' },
];

function rank(state: BodyMapState): number {
  if (state === 'selected') return 3;
  if (state === 'primary' || state === 'heat') return 2;
  return 1; // secondary
}

export function BodyMap({ states, onSelectRegion, className }: BodyMapProps) {
  const [view, setView] = useState<BodyRegion>('front');
  const interactive = !!onSelectRegion;

  // Resolve per-muscle states onto their svg regions. Muscles sharing one
  // region (the deltoid heads, the calf muscles) merge with the higher-rank
  // state winning.
  const regionStates = new Map<string, BodyMapMuscleState>();
  for (const s of states) {
    const muscle = getMuscle(s.muscleId);
    if (!muscle) continue;
    const existing = regionStates.get(muscle.svg_id);
    if (!existing || rank(s.state) >= rank(existing.state)) {
      regionStates.set(muscle.svg_id, s);
    }
  }

  const regions = view === 'front' ? FRONT_REGIONS : BACK_REGIONS;

  return (
    <div className={`atlas-body-map${className ? ` ${className}` : ''}`}>
      <div className="atlas-body-map__toolbar" role="group" aria-label="Body view">
        <button
          type="button"
          className={
            view === 'front'
              ? 'atlas-body-map__toggle atlas-body-map__toggle--active'
              : 'atlas-body-map__toggle'
          }
          aria-pressed={view === 'front'}
          onClick={() => setView('front')}
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
          onClick={() => setView('back')}
        >
          Back
        </button>
      </div>
      <svg
        viewBox="0 0 200 340"
        role={interactive ? 'group' : 'img'}
        aria-label={view === 'front' ? 'Front view of the body' : 'Back view of the body'}
        className="atlas-body-map__svg"
      >
        <g className="atlas-body-map__figure">
          <circle cx="100" cy="22" r="15" className="atlas-body-map__head" />
          <rect x="92" y="34" width="16" height="14" rx="4" className="atlas-body-map__head" />
          {regions.map((shape) => {
            const entry = regionStates.get(shape.svgId);
            const cls = entry
              ? `atlas-body-map__region atlas-body-map__region--${entry.state}`
              : 'atlas-body-map__region';
            const heatStyle =
              entry?.state === 'heat' && entry.intensity != null
                ? { opacity: 0.25 + 0.75 * entry.intensity }
                : undefined;
            return (
              <path
                key={shape.svgId}
                d={shape.d}
                className={cls}
                style={heatStyle}
                role={interactive ? 'button' : 'presentation'}
                tabIndex={interactive ? 0 : undefined}
                aria-label={interactive ? shape.label : undefined}
                onClick={interactive && onSelectRegion ? () => onSelectRegion(shape.svgId) : undefined}
                onKeyDown={
                  interactive && onSelectRegion
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectRegion(shape.svgId);
                        }
                      }
                    : undefined
                }
              >
                <title>{shape.label}</title>
              </path>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

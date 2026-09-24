import { MUSCLES, muscleName, musclesForSvgId } from '@atlas/anatomy';
import {
  BACK_MUSCLE_SHAPES,
  FRONT_MUSCLE_SHAPES,
  type VendoredMuscleShape,
} from './vendoredMuscleShapes';

/**
 * vNext Handoff 03B. The ATLAS <-> vendored-anatomy ADAPTER.
 *
 * ATLAS's canonical muscle taxonomy (`@atlas/anatomy`) is the source of
 * truth and is never reshaped to fit the imported art. Every upstream shape
 * (see vendoredMuscleShapes.ts -- pure upstream data, no ATLAS knowledge)
 * is classified here, in data, in exactly one of three ways:
 *
 *   1. DIRECT_REGIONS        the shape IS that ATLAS region (or a
 *                            sub-division of it, e.g. one of six trapezius
 *                            pieces). This is the normal case.
 *   2. SHARED_REGION_ALLOWLIST  the ATLAS region has NO shape of its own, so
 *                            it is deliberately drawn on the nearest shapes
 *                            that already belong to another region. Every
 *                            such compromise is listed here with a reason
 *                            and a visual-review verdict -- never implied by
 *                            general mapping logic.
 *   3. DECORATIVE_UPSTREAM   the shape has no ATLAS counterpart at all. It
 *                            is drawn (so the figure is complete) but is
 *                            never colored or interactive.
 *
 * `auditAnatomyMapping()` reports the whole picture and anatomyMapping.test.ts
 * fails if a canonical ATLAS muscle ever loses its mapping, if a shape is
 * classified twice or not at all, or if the allowlist changes without a
 * deliberate edit to that test.
 *
 * Rules for a SHARED shape: it displays the strongest state among all the
 * ATLAS regions it represents (see BodyMap's `strongerState`), and tapping
 * it selects every ATLAS muscle it represents (`muscleIdsForShape`).
 */

/** Short accessible label per canonical ATLAS svg_id. */
export const ATLAS_REGION_LABEL: Readonly<Record<string, string>> = {
  'chest-upper': 'Upper Chest',
  'chest-mid': 'Mid Chest',
  'chest-lower': 'Lower Chest',
  deltoid: 'Shoulders',
  serratus: 'Serratus Anterior',
  abs: 'Abs',
  obliques: 'Obliques',
  biceps: 'Biceps',
  forearms: 'Forearms',
  'hip-flexors': 'Hip Flexors',
  adductors: 'Adductors',
  quads: 'Quadriceps',
  tibialis: 'Tibialis Anterior',
  traps: 'Traps',
  'mid-back': 'Mid-Back / Rhomboids',
  lats: 'Lats',
  erectors: 'Spinal Erectors',
  triceps: 'Triceps',
  glutes: 'Glutes',
  abductors: 'Abductors',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
};

/** Tier 1. ATLAS svg_id -> the upstream shape ids that ARE that region. */
export const DIRECT_REGIONS: Readonly<Record<string, readonly string[]>> = {
  'chest-upper': ['chest-upper-left', 'chest-upper-right'],
  'chest-lower': ['chest-lower-left', 'chest-lower-right'],
  deltoid: [
    'shoulder-front-left',
    'shoulder-side-left',
    'shoulder-front-right',
    'shoulder-side-right',
    'deltoid-rear-left',
    'deltoid-rear-right',
  ],
  serratus: ['serratus-anterior-left', 'serratus-anterior-right'],
  abs: ['abs-upper-left', 'abs-upper-right', 'abs-lower-left', 'abs-lower-right'],
  obliques: ['obliques-left', 'obliques-right'],
  biceps: ['biceps-left', 'biceps-right'],
  forearms: [
    'forearm-left',
    'forearm-right',
    'forearm-flexors-left',
    'forearm-extensors-left',
    'forearm-flexors-right',
    'forearm-extensors-right',
  ],
  'hip-flexors': ['hip-flexor-left', 'hip-flexor-right'],
  adductors: ['adductors-left', 'adductors-right'],
  quads: ['quads-left', 'quads-right'],
  tibialis: ['tibialis-anterior-left', 'tibialis-anterior-right'],
  traps: [
    'traps-upper-left',
    'traps-mid-left',
    'traps-lower-left',
    'traps-upper-right',
    'traps-mid-right',
    'traps-lower-right',
  ],
  lats: [
    'lats-upper-left',
    'lats-mid-left',
    'lats-lower-left',
    'lats-upper-right',
    'lats-mid-right',
    'lats-lower-right',
  ],
  triceps: [
    'triceps-long-left',
    'triceps-lateral-left',
    'triceps-long-right',
    'triceps-lateral-right',
  ],
  // Upstream only draws the LOWER erector spinae (explicitly named so). The
  // upper erectors have no art -- an observation, not an allowlist entry,
  // because the region still has real erector shapes of its own.
  erectors: ['lower-back-erectors-left', 'lower-back-erectors-right'],
  // ATLAS's glutes region holds both Glute Max and Glute Med/Min
  // (`glutes.max`, `glutes.med_min`), and upstream draws both, so both
  // belong to it.
  glutes: [
    'gluteus-maximus-left',
    'gluteus-maximus-right',
    'gluteus-medius-left',
    'gluteus-medius-right',
  ],
  hamstrings: [
    'hamstrings-medial-left',
    'hamstrings-lateral-left',
    'hamstrings-medial-right',
    'hamstrings-lateral-right',
  ],
  calves: [
    'calves-gastroc-medial-left',
    'calves-gastroc-lateral-left',
    'calves-soleus-left',
    'calves-gastroc-medial-right',
    'calves-gastroc-lateral-right',
    'calves-soleus-right',
  ],
};

/** Visual-review verdict for an allowlisted fallback, set after inspecting it in the real Progress heatmap. */
export type FallbackVisualStatus = 'unreviewed' | 'accepted' | 'needs-custom-svg-patch';

export interface SharedRegionEntry {
  /** Canonical ATLAS svg_id that has NO upstream shape of its own. */
  atlasSvgId: string;
  /** Upstream shapes it is drawn on instead -- each must belong to another (direct) region. */
  renderOnUpstreamIds: readonly string[];
  /** Why this is an acceptable approximation, in plain words. */
  reason: string;
  visualStatus: FallbackVisualStatus;
  /** Required when visualStatus is 'needs-custom-svg-patch'. */
  followUp?: string;
}

/**
 * Tier 2. Every intentional shared/fallback mapping. Adding, removing or
 * changing one is a deliberate act: anatomyMapping.test.ts pins this list.
 * Do NOT invent anatomy to make a fallback disappear -- if one looks wrong,
 * flag it `needs-custom-svg-patch` and get real art drawn.
 */
export const SHARED_REGION_ALLOWLIST: readonly SharedRegionEntry[] = [
  {
    atlasSvgId: 'chest-mid',
    renderOnUpstreamIds: ['chest-lower-left', 'chest-lower-right'],
    reason:
      'Upstream draws only two pec regions: clavicular (upper) and sternal (lower). ATLAS additionally tracks Mid Chest, but the mid fibers are part of the sternal head, so Mid Chest is drawn on -- and selected with -- the sternal shapes it shares with Lower Chest.',
    // Reviewed 2026-09-24 in the real Progress heatmap (Volume mode, seeded history) and on the
    // exercise anatomy for a Mid-Chest-only exercise (Dumbbell Bench Press): the sternal shapes
    // read as the body of the pec, which is what "Mid Chest" means to a lifter. What it cannot do
    // is tell Mid from Lower Chest -- a resolution limit, disclosed by the shared region label.
    visualStatus: 'accepted',
  },
  {
    atlasSvgId: 'mid-back',
    renderOnUpstreamIds: ['traps-mid-left', 'traps-mid-right'],
    reason:
      'Upstream has no rhomboid shape. The rhomboids lie directly beneath the middle trapezius between the shoulder blades, so Mid-Back / Rhomboids is drawn on -- and selected with -- the mid-trapezius shapes it shares with Traps.',
    // Reviewed 2026-09-24 in the real back-view heatmap (rows / pulldowns): the mid-trapezius
    // shapes sit exactly where the rhomboids are (between the scapulae). Rhomboids and mid/lower
    // traps cannot be told apart -- disclosed by the shared region label.
    visualStatus: 'accepted',
  },
  {
    atlasSvgId: 'abductors',
    renderOnUpstreamIds: ['gluteus-medius-left', 'gluteus-medius-right'],
    reason:
      'Upstream has no outer-thigh (TFL / IT-band) shape. Gluteus medius is the principal hip abductor, so Abductors is drawn on -- and selected with -- the gluteus-medius shapes it shares with Glutes. The lateral-thigh part of the abductor group has no art.',
    // Reviewed 2026-09-24 on the exercise anatomy for Lever Seated Hip Abduction: only the small
    // gluteus-medius pads at the top of the hip light up, while the taxonomy names this muscle
    // "Abductors (Outer Thigh)". Defensible for the hip abductors, but under-drawn against its own
    // label -- flagged rather than papered over with invented anatomy.
    visualStatus: 'needs-custom-svg-patch',
    followUp:
      'Commission a lateral-thigh (TFL / IT-band) path for the back view so Abductors (Outer Thigh) lights the outer thigh as well as the gluteus-medius pad; until then the label promises more than the art shows.',
  },
];

export interface DecorativeEntry {
  /** 'unused-muscle': muscle tissue the art draws that ATLAS's taxonomy has no counterpart for. 'body-part': not muscle at all. */
  kind: 'unused-muscle' | 'body-part';
  note: string;
}

/**
 * Tier 3. Upstream shapes with no ATLAS counterpart: drawn as part of the
 * figure, never colored, never interactive. A nearby ATLAS region is NOT the
 * same muscle, so none of these is lit as a proxy for something else.
 */
export const DECORATIVE_UPSTREAM: Readonly<Record<string, DecorativeEntry>> = {
  'neck-left': { kind: 'unused-muscle', note: 'ATLAS tracks no neck muscles.' },
  'neck-right': { kind: 'unused-muscle', note: 'ATLAS tracks no neck muscles.' },
  nape: { kind: 'unused-muscle', note: 'ATLAS tracks no neck muscles.' },
  'lower-back-ql-left': {
    kind: 'unused-muscle',
    note: 'Quadratus lumborum: no ATLAS counterpart. Deliberately not lit by Spinal Erectors -- a neighbor is not the same muscle.',
  },
  'lower-back-ql-right': {
    kind: 'unused-muscle',
    note: 'Quadratus lumborum: no ATLAS counterpart. Deliberately not lit by Spinal Erectors -- a neighbor is not the same muscle.',
  },
  head: { kind: 'body-part', note: 'Head outline.' },
  face: { kind: 'body-part', note: 'Face.' },
  'head-back': { kind: 'body-part', note: 'Head outline (posterior).' },
  spine: { kind: 'body-part', note: 'Vertebral column outline, not muscle tissue.' },
  'elbow-left': { kind: 'body-part', note: 'Joint.' },
  'elbow-right': { kind: 'body-part', note: 'Joint.' },
  'knee-left': { kind: 'body-part', note: 'Joint.' },
  'knee-right': { kind: 'body-part', note: 'Joint.' },
  'knee-back-left': { kind: 'body-part', note: 'Joint.' },
  'knee-back-right': { kind: 'body-part', note: 'Joint.' },
  'hand-left': { kind: 'body-part', note: 'Hand.' },
  'hand-right': { kind: 'body-part', note: 'Hand.' },
  'hand-back-left': { kind: 'body-part', note: 'Hand.' },
  'hand-back-right': { kind: 'body-part', note: 'Hand.' },
  'foot-left': { kind: 'body-part', note: 'Foot.' },
  'foot-right': { kind: 'body-part', note: 'Foot.' },
  'foot-back-left': { kind: 'body-part', note: 'Foot.' },
  'foot-back-right': { kind: 'body-part', note: 'Foot.' },
};

// ---------------------------------------------------------------------------
// Derived lookups (module-level so BodyMap never recomputes them per render).
// ---------------------------------------------------------------------------

const DIRECT_BY_UPSTREAM = new Map<string, string>();
for (const [svgId, ids] of Object.entries(DIRECT_REGIONS)) {
  for (const id of ids) DIRECT_BY_UPSTREAM.set(id, svgId);
}

const FALLBACKS_BY_UPSTREAM = new Map<string, string[]>();
for (const entry of SHARED_REGION_ALLOWLIST) {
  for (const id of entry.renderOnUpstreamIds) {
    FALLBACKS_BY_UPSTREAM.set(id, [...(FALLBACKS_BY_UPSTREAM.get(id) ?? []), entry.atlasSvgId]);
  }
}

/** ATLAS svg_ids one upstream shape represents: its direct region first, then any allowlisted fallbacks. Empty = decorative. */
export function svgIdsForShape(upstreamId: string): string[] {
  const direct = DIRECT_BY_UPSTREAM.get(upstreamId);
  return [...(direct ? [direct] : []), ...(FALLBACKS_BY_UPSTREAM.get(upstreamId) ?? [])];
}

/** Every canonical ATLAS muscle id tapping/selecting this shape should mean. */
export function muscleIdsForShape(upstreamId: string): string[] {
  return [...new Set(svgIdsForShape(upstreamId).flatMap((svgId) => musclesForSvgId(svgId)))];
}

export type BodyView = 'front' | 'back';

/** One interactive unit: every shape in a view that represents the same set of ATLAS regions (e.g. left + right chest-lower). */
export interface RegionGroup {
  key: string;
  svgIds: string[];
  muscleIds: string[];
  /** Accessible name, e.g. "Lower Chest / Mid Chest". */
  label: string;
  shapes: VendoredMuscleShape[];
}

export interface ViewLayout {
  viewBox: string;
  /** Drawn first, never colored/interactive. */
  decorative: VendoredMuscleShape[];
  groups: RegionGroup[];
}

const SHAPES_BY_VIEW: Record<BodyView, VendoredMuscleShape[]> = {
  front: FRONT_MUSCLE_SHAPES,
  back: BACK_MUSCLE_SHAPES,
};

// Upstream's own per-view viewBoxes (same coordinate space, back offset by 37).
const VIEW_BOX: Record<BodyView, string> = { front: '0 0 35 93', back: '37 0 35 93' };

function buildLayout(view: BodyView): ViewLayout {
  const decorative: VendoredMuscleShape[] = [];
  const groups = new Map<string, RegionGroup>();
  for (const shape of SHAPES_BY_VIEW[view]) {
    const svgIds = svgIdsForShape(shape.id);
    if (svgIds.length === 0) {
      decorative.push(shape);
      continue;
    }
    // One tab stop / one screen-reader announcement per region, not per
    // upstream sub-shape (there are six trapezius pieces, six calf pieces...).
    const key = svgIds.join('+');
    const group = groups.get(key) ?? {
      key,
      svgIds,
      muscleIds: muscleIdsForShape(shape.id),
      label: svgIds.map((id) => ATLAS_REGION_LABEL[id] ?? id).join(' / '),
      shapes: [],
    };
    group.shapes.push(shape);
    groups.set(key, group);
  }
  return { viewBox: VIEW_BOX[view], decorative, groups: [...groups.values()] };
}

export const VIEW_LAYOUTS: Readonly<Record<BodyView, ViewLayout>> = {
  front: buildLayout('front'),
  back: buildLayout('back'),
};

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface SharedUpstreamGroup {
  /** 'taxonomy': ATLAS itself puts these muscles in one region. 'allowlisted-fallback': the art forced the sharing. */
  cause: 'taxonomy' | 'allowlisted-fallback';
  muscleIds: string[];
  svgIds: string[];
  upstreamIds: string[];
}

export interface AnatomyMappingAudit {
  canonicalSvgIds: string[];
  /** Canonical svg_ids drawn on at least one upstream path (directly or via the allowlist). */
  renderableSvgIds: string[];
  /** Canonical svg_ids with NO upstream path at all. Must be empty. */
  unmappedSvgIds: string[];
  fallbacks: (SharedRegionEntry & { muscleIds: string[]; hostSvgIds: string[] })[];
  /** Upstream shapes that draw more than one canonical ATLAS muscle, grouped by identical muscle set. */
  sharedUpstream: SharedUpstreamGroup[];
  /** Muscle tissue the art draws that ATLAS has no counterpart for. */
  unusedUpstreamMuscles: { id: string; name: string; note: string }[];
  /** Non-muscle body parts the art draws. */
  decorativeBodyParts: { id: string; name: string; note: string }[];
  /** Integrity problems. Every list must be empty. */
  problems: {
    /** Upstream shapes that are neither direct-mapped nor listed as decorative. */
    unclassifiedUpstream: string[];
    /** Ids named in DIRECT_REGIONS / the allowlist / DECORATIVE_UPSTREAM that don't exist upstream. */
    staleReferences: string[];
    /** Upstream ids assigned to more than one region, or both a region and decorative. */
    duplicateAssignments: string[];
    /** Allowlist entries that are redundant, target another fallback, or lack a reason/follow-up. */
    invalidAllowlistEntries: string[];
  };
}

function allUpstream(): (VendoredMuscleShape & { view: BodyView })[] {
  return [
    ...FRONT_MUSCLE_SHAPES.map((s) => ({ ...s, view: 'front' as const })),
    ...BACK_MUSCLE_SHAPES.map((s) => ({ ...s, view: 'back' as const })),
  ];
}

export function auditAnatomyMapping(): AnatomyMappingAudit {
  const upstream = allUpstream();
  const upstreamIds = new Set(upstream.map((s) => s.id));
  const canonicalSvgIds = [...new Set(MUSCLES.map((m) => m.svg_id))].sort();

  const renderable = new Set<string>();
  for (const [svgId, ids] of Object.entries(DIRECT_REGIONS)) {
    if (ids.some((id) => upstreamIds.has(id))) renderable.add(svgId);
  }
  for (const entry of SHARED_REGION_ALLOWLIST) {
    if (entry.renderOnUpstreamIds.some((id) => upstreamIds.has(id))) renderable.add(entry.atlasSvgId);
  }

  // --- integrity ---
  const assignmentCount = new Map<string, number>();
  const bump = (id: string) => assignmentCount.set(id, (assignmentCount.get(id) ?? 0) + 1);
  for (const ids of Object.values(DIRECT_REGIONS)) ids.forEach(bump);
  Object.keys(DECORATIVE_UPSTREAM).forEach(bump);

  const referenced = [
    ...Object.values(DIRECT_REGIONS).flat(),
    ...Object.keys(DECORATIVE_UPSTREAM),
    ...SHARED_REGION_ALLOWLIST.flatMap((e) => e.renderOnUpstreamIds),
  ];

  const invalidAllowlistEntries: string[] = [];
  const canonical = new Set(canonicalSvgIds);
  for (const entry of SHARED_REGION_ALLOWLIST) {
    if (!canonical.has(entry.atlasSvgId)) invalidAllowlistEntries.push(`${entry.atlasSvgId}: not a canonical svg_id`);
    if (entry.atlasSvgId in DIRECT_REGIONS) invalidAllowlistEntries.push(`${entry.atlasSvgId}: already has its own shapes (redundant fallback)`);
    if (!entry.reason.trim()) invalidAllowlistEntries.push(`${entry.atlasSvgId}: missing reason`);
    if (entry.visualStatus === 'needs-custom-svg-patch' && !entry.followUp?.trim()) {
      invalidAllowlistEntries.push(`${entry.atlasSvgId}: flagged needs-custom-svg-patch without a followUp`);
    }
    for (const id of entry.renderOnUpstreamIds) {
      if (!DIRECT_BY_UPSTREAM.has(id)) invalidAllowlistEntries.push(`${entry.atlasSvgId}: host shape ${id} is not a direct region`);
    }
  }

  // --- shared upstream: group shapes by identical canonical muscle set ---
  const groups = new Map<string, SharedUpstreamGroup>();
  for (const shape of upstream) {
    const svgIds = svgIdsForShape(shape.id);
    const muscleIds = muscleIdsForShape(shape.id);
    if (muscleIds.length < 2) continue;
    const key = [...muscleIds].sort().join('|');
    const isFallback = svgIds.length > 1;
    const existing = groups.get(key) ?? {
      cause: isFallback ? ('allowlisted-fallback' as const) : ('taxonomy' as const),
      muscleIds: [...muscleIds].sort(),
      svgIds,
      upstreamIds: [],
    };
    existing.upstreamIds.push(shape.id);
    groups.set(key, existing);
  }

  return {
    canonicalSvgIds,
    renderableSvgIds: [...renderable].sort(),
    unmappedSvgIds: canonicalSvgIds.filter((id) => !renderable.has(id)),
    fallbacks: SHARED_REGION_ALLOWLIST.map((entry) => ({
      ...entry,
      muscleIds: musclesForSvgId(entry.atlasSvgId),
      hostSvgIds: [...new Set(entry.renderOnUpstreamIds.map((id) => DIRECT_BY_UPSTREAM.get(id) ?? '?'))],
    })),
    sharedUpstream: [...groups.values()].sort((a, b) => a.svgIds[0]!.localeCompare(b.svgIds[0]!)),
    unusedUpstreamMuscles: upstream
      .filter((s) => DECORATIVE_UPSTREAM[s.id]?.kind === 'unused-muscle')
      .map((s) => ({ id: s.id, name: s.name, note: DECORATIVE_UPSTREAM[s.id]!.note })),
    decorativeBodyParts: upstream
      .filter((s) => DECORATIVE_UPSTREAM[s.id]?.kind === 'body-part')
      .map((s) => ({ id: s.id, name: s.name, note: DECORATIVE_UPSTREAM[s.id]!.note })),
    problems: {
      unclassifiedUpstream: upstream
        .filter((s) => !DIRECT_BY_UPSTREAM.has(s.id) && !(s.id in DECORATIVE_UPSTREAM))
        .map((s) => s.id),
      staleReferences: [...new Set(referenced.filter((id) => !upstreamIds.has(id)))],
      duplicateAssignments: [...assignmentCount].filter(([, n]) => n > 1).map(([id]) => id),
      invalidAllowlistEntries,
    },
  };
}

/** Human-readable audit report (used by docs/ANATOMY.md and the completion report). */
export function formatAnatomyAudit(audit: AnatomyMappingAudit): string {
  const names = (ids: string[]) => ids.map((id) => muscleName(id)).join(', ');
  const lines: string[] = [];
  lines.push(`1. Canonical svg_ids: ${audit.canonicalSvgIds.length}; drawn on >=1 path: ${audit.renderableSvgIds.length}; unmapped: ${audit.unmappedSvgIds.length ? audit.unmappedSvgIds.join(', ') : 'none'}`);
  lines.push('', '2. ATLAS muscles sharing the same upstream path(s):');
  for (const g of audit.sharedUpstream) {
    lines.push(`   [${g.cause}] ${names(g.muscleIds)}  <-  ${g.upstreamIds.join(', ')}`);
  }
  lines.push('', '3. Renderer muscles unused by ATLAS (drawn, never colored):');
  for (const m of audit.unusedUpstreamMuscles) lines.push(`   ${m.id} (${m.name}) -- ${m.note}`);
  lines.push(`   plus ${audit.decorativeBodyParts.length} non-muscle body parts: ${audit.decorativeBodyParts.map((p) => p.id).join(', ')}`);
  lines.push('', '5. Allowlisted shared/fallback mappings:');
  for (const f of audit.fallbacks) {
    lines.push(`   ${f.atlasSvgId} -> ${f.renderOnUpstreamIds.join(', ')}  (shares with ${f.hostSvgIds.join(', ')}; ${f.visualStatus}${f.followUp ? `; follow-up: ${f.followUp}` : ''})`);
  }
  const problems = Object.entries(audit.problems).filter(([, v]) => v.length > 0);
  lines.push('', `Integrity problems: ${problems.length ? problems.map(([k, v]) => `${k}=[${v.join(', ')}]`).join('; ') : 'none'}`);
  return lines.join('\n');
}

import { describe, expect, it } from 'vitest';
import { MUSCLES, muscleName } from '@atlas/anatomy';
import {
  ATLAS_REGION_LABEL,
  DECORATIVE_UPSTREAM,
  DIRECT_REGIONS,
  SHARED_REGION_ALLOWLIST,
  VIEW_LAYOUTS,
  auditAnatomyMapping,
  formatAnatomyAudit,
  muscleIdsForShape,
  svgIdsForShape,
} from './anatomyMapping';
import { BACK_MUSCLE_SHAPES, FRONT_MUSCLE_SHAPES } from './vendoredMuscleShapes';

const ALL_SHAPES = [
  ...FRONT_MUSCLE_SHAPES.map((s) => ({ ...s, view: 'front' as const })),
  ...BACK_MUSCLE_SHAPES.map((s) => ({ ...s, view: 'back' as const })),
];

describe('anatomy mapping audit: every canonical ATLAS muscle stays mapped', () => {
  const audit = auditAnatomyMapping();

  it('every canonical svg_id is drawn on at least one upstream path', () => {
    expect(audit.unmappedSvgIds).toEqual([]);
    expect(audit.renderableSvgIds).toEqual(audit.canonicalSvgIds);
  });

  it('has no integrity problems (unclassified, stale, duplicated or invalid allowlist entries)', () => {
    expect(audit.problems).toEqual({
      unclassifiedUpstream: [],
      staleReferences: [],
      duplicateAssignments: [],
      invalidAllowlistEntries: [],
    });
  });

  // The failing-on-regression test the handoff asks for: delete a mapping (or
  // rename an upstream id) and the muscle named in the failure message loses
  // its shape.
  it.each(MUSCLES.map((m) => [m.id, m] as const))(
    'canonical muscle %s is both drawn on and selectable from an upstream path',
    (_id, muscle) => {
      const shapes = ALL_SHAPES.filter((s) => muscleIdsForShape(s.id).includes(muscle.id));
      expect(shapes.length, `${muscle.id} (svg_id ${muscle.svg_id}) has no upstream path`).toBeGreaterThan(0);
      // Deep muscles (rotator cuff) have no surface view of their own.
      if (muscle.region !== 'deep') {
        expect(
          shapes.some((s) => s.view === muscle.region),
          `${muscle.id} is declared "${muscle.region}" but is only drawn on the other view`,
        ).toBe(true);
      }
    },
  );

  it('every canonical svg_id has an accessible label', () => {
    for (const svgId of audit.canonicalSvgIds) {
      expect(ATLAS_REGION_LABEL[svgId], `no label for ${svgId}`).toBeTruthy();
    }
  });

  it('does not reshape the canonical taxonomy to fit the art: the taxonomy is the source of truth', () => {
    // 30 canonical muscles over 22 svg_ids as of MUSCLE_TAXONOMY_VERSION 1.0.0.
    // If this changes, the audit above forces an explicit mapping decision.
    expect(MUSCLES).toHaveLength(30);
    expect(audit.canonicalSvgIds).toHaveLength(22);
  });
});

describe('anatomy mapping audit: the intentional shared/fallback allowlist', () => {
  it('is exactly the documented set -- changing it is a deliberate edit to this test', () => {
    expect(SHARED_REGION_ALLOWLIST.map((e) => e.atlasSvgId).sort()).toEqual([
      'abductors',
      'chest-mid',
      'mid-back',
    ]);
  });

  it('pins each fallback to the shapes it renders on', () => {
    const byId = Object.fromEntries(SHARED_REGION_ALLOWLIST.map((e) => [e.atlasSvgId, e.renderOnUpstreamIds]));
    expect(byId['chest-mid']).toEqual(['chest-lower-left', 'chest-lower-right']);
    expect(byId['mid-back']).toEqual(['traps-mid-left', 'traps-mid-right']);
    expect(byId['abductors']).toEqual(['gluteus-medius-left', 'gluteus-medius-right']);
  });

  it('never lets a fallback region also own shapes (that would be a redundant, hidden mapping)', () => {
    for (const entry of SHARED_REGION_ALLOWLIST) {
      expect(DIRECT_REGIONS[entry.atlasSvgId]).toBeUndefined();
    }
  });

  it('every entry explains itself, and a needs-custom-svg-patch flag always carries a follow-up', () => {
    for (const entry of SHARED_REGION_ALLOWLIST) {
      expect(entry.reason.trim().length).toBeGreaterThan(20);
      if (entry.visualStatus === 'needs-custom-svg-patch') {
        expect(entry.followUp?.trim()).toBeTruthy();
      }
    }
  });

  it('every fallback has been visually reviewed in the real heatmap (no entry left "unreviewed")', () => {
    for (const entry of SHARED_REGION_ALLOWLIST) {
      expect(entry.visualStatus, `${entry.atlasSvgId} still needs a visual review`).not.toBe('unreviewed');
    }
  });

  it('a fallback shape represents BOTH its own region and the fallback, so it is drawn and selected as either', () => {
    expect(svgIdsForShape('chest-lower-left')).toEqual(['chest-lower', 'chest-mid']);
    expect(muscleIdsForShape('chest-lower-left').sort()).toEqual(['chest.lower', 'chest.mid']);
    expect(svgIdsForShape('traps-mid-left')).toEqual(['traps', 'mid-back']);
    expect(muscleIdsForShape('traps-mid-left')).toContain('back.rhomboids');
    expect(svgIdsForShape('gluteus-medius-right')).toEqual(['glutes', 'abductors']);
    // ...but a fallback is scoped to its host shapes only: upper traps never claim rhomboids.
    expect(svgIdsForShape('traps-upper-left')).toEqual(['traps']);
    expect(muscleIdsForShape('traps-upper-left')).not.toContain('back.rhomboids');
    expect(svgIdsForShape('gluteus-maximus-left')).toEqual(['glutes']);
  });
});

describe('Hip Abductors (owner decision 2026-10-05: accept the art, fix the label)', () => {
  it('is named for what the art draws, with its canonical identity unchanged', () => {
    expect(muscleName('hamstrings.abductors')).toBe('Hip Abductors');
    expect(ATLAS_REGION_LABEL['abductors']).toBe('Hip Abductors');
    expect(MUSCLES.find((m) => m.id === 'hamstrings.abductors')).toMatchObject({
      group_id: 'hamstrings',
      region: 'back',
      svg_id: 'abductors',
    });
    // the back-view tab stop that holds the gluteus-medius pads announces it under the new name
    expect(VIEW_LAYOUTS.back.groups.find((g) => g.key === 'glutes+abductors')?.label).toBe(
      'Glutes / Hip Abductors',
    );
  });

  it('promises no outer thigh anywhere a person can read a muscle or region name', () => {
    const readable = [
      ...MUSCLES.map((m) => m.name),
      ...Object.values(ATLAS_REGION_LABEL),
      ...[...VIEW_LAYOUTS.front.groups, ...VIEW_LAYOUTS.back.groups].map((g) => g.label),
    ];
    expect(readable.filter((label) => /outer thigh/i.test(label))).toEqual([]);
  });

  it('is an accepted fallback, with the custom lateral-thigh art recorded as deferred', () => {
    const entry = SHARED_REGION_ALLOWLIST.find((e) => e.atlasSvgId === 'abductors');
    expect(entry?.visualStatus).toBe('accepted');
    expect(entry?.followUp).toMatch(/deferred/i);
  });
});

describe('anatomy mapping audit: reports', () => {
  const audit = auditAnatomyMapping();

  it('lists exactly which ATLAS muscles share upstream paths, and why', () => {
    const summary = audit.sharedUpstream
      .map((g) => `${g.cause}: ${g.muscleIds.join(' + ')}`)
      .sort();
    expect(summary).toEqual(
      [
        'taxonomy: arms.biceps + arms.brachialis',
        'taxonomy: arms.forearm_extensors + arms.forearm_flexors',
        'taxonomy: back.traps_mid + back.traps_upper',
        'taxonomy: calves.gastrocnemius + calves.soleus',
        'taxonomy: glutes.max + glutes.med_min',
        'taxonomy: shoulders.anterior + shoulders.lateral + shoulders.posterior + shoulders.rotator_cuff',
        'allowlisted-fallback: chest.lower + chest.mid',
        'allowlisted-fallback: back.rhomboids + back.traps_mid + back.traps_upper',
        'allowlisted-fallback: glutes.max + glutes.med_min + hamstrings.abductors',
      ].sort(),
    );
  });

  it('lists exactly the renderer muscles ATLAS does not use', () => {
    expect(audit.unusedUpstreamMuscles.map((m) => m.id).sort()).toEqual([
      'lower-back-ql-left',
      'lower-back-ql-right',
      'nape',
      'neck-left',
      'neck-right',
    ]);
  });

  it('never colors an unused renderer muscle as a proxy for a different ATLAS muscle', () => {
    for (const id of Object.keys(DECORATIVE_UPSTREAM)) {
      expect(svgIdsForShape(id), `${id} is decorative but resolves to an ATLAS region`).toEqual([]);
    }
  });

  it('pins the upstream shape counts so upgrading body-muscles forces a mapping re-review', () => {
    expect(FRONT_MUSCLE_SHAPES).toHaveLength(40);
    expect(BACK_MUSCLE_SHAPES).toHaveLength(49);
  });

  it('formats a readable report covering every section', () => {
    const text = formatAnatomyAudit(audit);
    expect(text).toContain('Canonical svg_ids: 22; drawn on >=1 path: 22; unmapped: none');
    expect(text).toContain('[allowlisted-fallback]');
    expect(text).toContain('Renderer muscles unused by ATLAS');
    expect(text).toContain('chest-mid -> chest-lower-left, chest-lower-right');
    expect(text).toContain('Integrity problems: none');
  });
});

describe('view layouts', () => {
  it('groups shapes per ATLAS region so keyboard/screen-reader users get one stop per region, not per sub-shape', () => {
    // Regression guard: an early version made every upstream shape its own
    // tab stop (~70 per view) instead of ~12.
    expect(VIEW_LAYOUTS.front.groups.length).toBeLessThanOrEqual(15);
    expect(VIEW_LAYOUTS.back.groups.length).toBeLessThanOrEqual(15);
    const lowerChest = VIEW_LAYOUTS.front.groups.find((g) => g.key === 'chest-lower+chest-mid');
    expect(lowerChest?.shapes).toHaveLength(2);
    expect(lowerChest?.label).toBe('Lower Chest / Mid Chest');
    const traps = VIEW_LAYOUTS.back.groups.find((g) => g.key === 'traps');
    expect(traps?.shapes).toHaveLength(4); // upper + lower, both sides; mid pieces form their own group
  });

  it('every upstream shape lands in exactly one place: one group or the decorative layer', () => {
    for (const view of ['front', 'back'] as const) {
      const layout = VIEW_LAYOUTS[view];
      const placed = [...layout.decorative, ...layout.groups.flatMap((g) => g.shapes)].map((s) => s.id);
      const source = (view === 'front' ? FRONT_MUSCLE_SHAPES : BACK_MUSCLE_SHAPES).map((s) => s.id);
      expect([...placed].sort()).toEqual([...source].sort());
    }
  });

  it('uses the upstream per-view viewBoxes unchanged', () => {
    expect(VIEW_LAYOUTS.front.viewBox).toBe('0 0 35 93');
    expect(VIEW_LAYOUTS.back.viewBox).toBe('37 0 35 93');
  });
});

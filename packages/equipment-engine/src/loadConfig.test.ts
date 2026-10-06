import { describe, expect, it } from 'vitest';
import { createGymEquipmentInstance } from './createEquipment';
import {
  availableLoads,
  hasEquipmentData,
  isAtEquipmentMax,
  nextAvailableLoad,
} from './availableLoads';
import {
  describeLoads,
  describeMaximum,
  draftFromInstance,
  EMPTY_LOAD_DRAFT,
  MAX_EXACT_LOADS,
  MAX_RANGE_STEPS,
  parseLoadConfig,
  type LoadConfigDraft,
} from './loadConfig';

const draft = (patch: Partial<LoadConfigDraft>): LoadConfigDraft => ({
  ...EMPTY_LOAD_DRAFT,
  ...patch,
});

/** Builds an instance the way the editor would, from a parsed draft. */
function instanceFrom(d: LoadConfigDraft) {
  const parsed = parseLoadConfig(d);
  if (!parsed.ok) throw new Error('draft should parse');
  const f = parsed.fields;
  return createGymEquipmentInstance({
    trainingLocationId: 'l',
    equipmentDefinitionId: 'e',
    label: 'Machine',
    exactLoads: f.exact_loads,
    minLoad: f.min_load,
    maxLoad: f.max_load,
    increment: f.increment,
  });
}

describe('exact list', () => {
  it('keeps a nonuniform rack exactly: 10, 15, 20, 25, 30, 40, 50 -- nothing filled in between', () => {
    const result = parseLoadConfig(draft({ mode: 'exact', exact: '10, 15, 20, 25, 30, 40, 50' }));
    expect(result).toEqual({
      ok: true,
      fields: {
        exact_loads: [10, 15, 20, 25, 30, 40, 50],
        min_load: null,
        max_load: null,
        increment: null,
      },
    });
    const instance = instanceFrom(draft({ mode: 'exact', exact: '10, 15, 20, 25, 30, 40, 50' }));
    expect(availableLoads(instance)).toEqual([10, 15, 20, 25, 30, 40, 50]);
    expect(nextAvailableLoad(instance, 30)).toBe(40);
  });

  it('accepts commas, spaces and new lines, in any order, sorts them and drops repeats', () => {
    const result = parseLoadConfig(draft({ mode: 'exact', exact: '50\n20 20, 10;  30' }));
    expect(result).toMatchObject({ ok: true, fields: { exact_loads: [10, 20, 30, 50] } });
  });

  it('allows fractional plates', () => {
    expect(parseLoadConfig(draft({ mode: 'exact', exact: '2.5 5 7.5' }))).toMatchObject({
      ok: true,
      fields: { exact_loads: [2.5, 5, 7.5] },
    });
  });

  it('says which entries are not numbers, tied to the exact field', () => {
    const result = parseLoadConfig(draft({ mode: 'exact', exact: '10, abc, 30, -5, 0' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.exact).toContain('"abc"');
      expect(result.errors.exact).toContain('"-5"');
      expect(Object.keys(result.errors)).toEqual(['exact']);
    }
  });

  it('needs at least one load', () => {
    const result = parseLoadConfig(draft({ mode: 'exact', exact: '  ,  ' }));
    expect(result.ok).toBe(false);
  });

  it('refuses an absurd list instead of storing it', () => {
    const many = Array.from({ length: MAX_EXACT_LOADS + 1 }, (_, i) => i + 1).join(' ');
    expect(parseLoadConfig(draft({ mode: 'exact', exact: many })).ok).toBe(false);
  });
});

describe('range with an increment', () => {
  it('describes a uniform stack: 20 to 170 in steps of 10', () => {
    const instance = instanceFrom(draft({ mode: 'range', min: '20', max: '170', increment: '10' }));
    expect(availableLoads(instance)).toHaveLength(16);
    expect(availableLoads(instance)[0]).toBe(20);
    expect(isAtEquipmentMax(instance, 170)).toBe(true);
    expect(nextAvailableLoad(instance, 160)).toBe(170);
  });

  it('needs all three numbers, each error on its own field', () => {
    const result = parseLoadConfig(draft({ mode: 'range', min: '', max: '', increment: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['increment', 'max', 'min']);
  });

  it('rejects a maximum that is not above the minimum, and a zero or negative step', () => {
    const backwards = parseLoadConfig(
      draft({ mode: 'range', min: '50', max: '40', increment: '5' }),
    );
    expect(backwards.ok).toBe(false);
    if (!backwards.ok) expect(backwards.errors.max).toBeTruthy();
    const noStep = parseLoadConfig(draft({ mode: 'range', min: '10', max: '40', increment: '0' }));
    expect(noStep.ok).toBe(false);
    if (!noStep.ok) expect(noStep.errors.increment).toBeTruthy();
  });

  it('catches a step that would produce thousands of loads', () => {
    const result = parseLoadConfig(
      draft({ mode: 'range', min: '0', max: String(MAX_RANGE_STEPS * 10), increment: '1' }),
    );
    expect(result.ok).toBe(false);
  });

  it('allows a range that starts at zero', () => {
    expect(parseLoadConfig(draft({ mode: 'range', min: '0', max: '100', increment: '5' })).ok).toBe(
      true,
    );
  });

  it('refuses a step bigger than the span (10-20 in steps of 50 is one load and an unreachable heaviest), but allows a step equal to it', () => {
    const tooBig = parseLoadConfig(draft({ mode: 'range', min: '10', max: '20', increment: '50' }));
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(Object.keys(tooBig.errors)).toEqual(['increment']);
    // exactly the span: the lightest and the heaviest, both reachable
    const exact = parseLoadConfig(draft({ mode: 'range', min: '10', max: '20', increment: '10' }));
    expect(exact.ok).toBe(true);
    expect(
      availableLoads(instanceFrom(draft({ mode: 'range', min: '10', max: '20', increment: '10' }))),
    ).toEqual([10, 20]);
  });
});

describe('maximum only', () => {
  it('stores just the maximum and synthesizes no intermediate loads from it', () => {
    const result = parseLoadConfig(draft({ mode: 'max', max: '170' }));
    expect(result).toEqual({
      ok: true,
      fields: { exact_loads: null, min_load: null, max_load: 170, increment: null },
    });
    const instance = instanceFrom(draft({ mode: 'max', max: '170' }));
    expect(availableLoads(instance)).toEqual([]);
    expect(hasEquipmentData(instance)).toBe(true);
  });

  it('needs a positive maximum', () => {
    expect(parseLoadConfig(draft({ mode: 'max', max: '' })).ok).toBe(false);
    expect(parseLoadConfig(draft({ mode: 'max', max: '0' })).ok).toBe(false);
    expect(parseLoadConfig(draft({ mode: 'max', max: 'heavy' })).ok).toBe(false);
  });
});

describe('unknown loads', () => {
  it('is valid and stores nothing -- the owner is never forced to fill this in', () => {
    const result = parseLoadConfig(draft({ mode: 'unknown', exact: '10 20', max: '99' }));
    expect(result).toEqual({
      ok: true,
      fields: { exact_loads: null, min_load: null, max_load: null, increment: null },
    });
    expect(hasEquipmentData(instanceFrom(draft({ mode: 'unknown' })))).toBe(false);
  });
});

describe('draftFromInstance: editing starts from the shape the equipment was saved in', () => {
  it('round-trips each shape', () => {
    for (const original of [
      draft({ mode: 'exact', exact: '10, 20, 40' }),
      draft({ mode: 'range', min: '20', max: '170', increment: '10' }),
      draft({ mode: 'max', max: '80' }),
      draft({ mode: 'unknown' }),
    ]) {
      const back = draftFromInstance(instanceFrom(original));
      expect(back.mode).toBe(original.mode);
      expect(parseLoadConfig(back)).toEqual(parseLoadConfig(original));
    }
  });
});

describe('describeMaximum', () => {
  it('names the heaviest load whatever shape the loads were described in, and never invents one', () => {
    expect(describeMaximum(instanceFrom(draft({ mode: 'exact', exact: '5 10 15 80' })))).toBe(
      'Max 80 lb',
    );
    expect(
      describeMaximum(
        instanceFrom(draft({ mode: 'range', min: '20', max: '170', increment: '10' })),
      ),
    ).toBe('Max 170 lb');
    expect(describeMaximum(instanceFrom(draft({ mode: 'max', max: '200' })))).toBe('Max 200 lb');
    expect(describeMaximum(instanceFrom(draft({})))).toBe('Loads not set');
  });
});

describe('describeLoads', () => {
  it("reads each shape plainly, in the instance's own unit", () => {
    expect(describeLoads(instanceFrom(draft({ mode: 'exact', exact: '5 10 15' })))).toBe(
      '5, 10, 15 lb',
    );
    expect(
      describeLoads(instanceFrom(draft({ mode: 'exact', exact: '5 10 15 20 25 30 40 80' }))),
    ).toBe('5–80 lb, 8 loads');
    expect(describeLoads(instanceFrom(draft({ mode: 'exact', exact: '50' })))).toBe(
      'One load: 50 lb',
    );
    expect(
      describeLoads(instanceFrom(draft({ mode: 'range', min: '20', max: '170', increment: '10' }))),
    ).toBe('20–170 lb, steps of 10');
    expect(describeLoads(instanceFrom(draft({ mode: 'max', max: '170' })))).toBe('Max 170 lb');
    expect(describeLoads(instanceFrom(draft({ mode: 'unknown' })))).toBe('Loads not set');
  });

  it('says kg for a kg instance without converting the numbers', () => {
    const kg = createGymEquipmentInstance({
      trainingLocationId: 'l',
      equipmentDefinitionId: 'e',
      label: 'K',
      maxLoad: 100,
      unit: 'kg',
    });
    expect(describeLoads(kg)).toBe('Max 100 kg');
  });
});

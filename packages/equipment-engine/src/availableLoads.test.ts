import { describe, expect, it } from 'vitest';
import { createGymEquipmentInstance } from './createEquipment';
import {
  availableLoads,
  hasEquipmentData,
  hasLoadList,
  isAtEquipmentMax,
  maximumLoad,
  nextAvailableLoad,
} from './availableLoads';
import { confirmEquipmentMaximum } from './confirmEquipmentMaximum';

describe('exact load list', () => {
  it('represents a nonuniform dumbbell rack exactly, sorted', () => {
    const dumbbells = createGymEquipmentInstance({
      trainingLocationId: 'loc-1',
      equipmentDefinitionId: 'eq-dumbbell',
      label: 'Dumbbells',
      exactLoads: [80, 5, 10, 15, 20, 30, 25], // deliberately unsorted, nonuniform-looking input
    });
    expect(availableLoads(dumbbells)).toEqual([5, 10, 15, 20, 25, 30, 80]);
  });

  it('"80 lb dumbbells are the heaviest here" is directly representable as the max', () => {
    const dumbbells = createGymEquipmentInstance({
      trainingLocationId: 'loc-1',
      equipmentDefinitionId: 'eq-dumbbell',
      label: 'Dumbbells',
      exactLoads: [5, 10, 15, 70, 75, 80],
    });
    expect(isAtEquipmentMax(dumbbells, 80)).toBe(true);
    expect(nextAvailableLoad(dumbbells, 80)).toBeNull();
    expect(nextAvailableLoad(dumbbells, 75)).toBe(80);
  });
});

describe('nonuniform increments via min/max/increment', () => {
  it('"machine chest press stops at 170 lb" -- a uniform 10 lb-step stack up to 170', () => {
    const chestPress = createGymEquipmentInstance({
      trainingLocationId: 'loc-1',
      equipmentDefinitionId: 'eq-chest-press',
      label: 'Machine Chest Press',
      minLoad: 10,
      maxLoad: 170,
      increment: 10,
    });
    const loads = availableLoads(chestPress);
    expect(loads[0]).toBe(10);
    expect(loads[loads.length - 1]).toBe(170);
    expect(loads).toHaveLength(17);
    expect(isAtEquipmentMax(chestPress, 170)).toBe(true);
    expect(nextAvailableLoad(chestPress, 160)).toBe(170);
    expect(nextAvailableLoad(chestPress, 170)).toBeNull();
  });

  it('never recommends a load past the configured maximum even mid-step', () => {
    const machine = createGymEquipmentInstance({
      trainingLocationId: 'loc-1',
      equipmentDefinitionId: 'eq-1',
      label: 'Odd-step machine',
      minLoad: 0,
      maxLoad: 47, // not an exact multiple of the increment
      increment: 15,
    });
    const loads = availableLoads(machine);
    expect(Math.max(...loads)).toBeLessThanOrEqual(47);
  });
});

describe('two gyms with different maxima', () => {
  it('the same canonical exercise has independent constraints per equipment instance', () => {
    const mainGymPress = createGymEquipmentInstance({
      trainingLocationId: 'loc-main',
      equipmentDefinitionId: 'eq-chest-press',
      label: 'Chest Press / Main Gym / Machine A',
      minLoad: 10,
      maxLoad: 170,
      increment: 10,
    });
    const schoolGymPress = createGymEquipmentInstance({
      trainingLocationId: 'loc-school',
      equipmentDefinitionId: 'eq-chest-press',
      label: 'Chest Press / School Gym / Machine B',
      minLoad: 10,
      maxLoad: 120,
      increment: 10,
    });
    expect(isAtEquipmentMax(mainGymPress, 120)).toBe(false);
    expect(isAtEquipmentMax(schoolGymPress, 120)).toBe(true);
    expect(nextAvailableLoad(mainGymPress, 120)).toBe(130);
    expect(nextAvailableLoad(schoolGymPress, 120)).toBeNull();
  });
});

describe('no equipment data configured yet', () => {
  it('is distinct from "at max" -- the owner is never forced to configure a gym before training', () => {
    const unconfigured = createGymEquipmentInstance({
      trainingLocationId: 'loc-1',
      equipmentDefinitionId: 'eq-1',
      label: 'Unconfigured machine',
    });
    expect(hasEquipmentData(unconfigured)).toBe(false);
    expect(isAtEquipmentMax(unconfigured, 999)).toBe(false);
    expect(nextAvailableLoad(unconfigured, 100)).toBeNull();
    expect(availableLoads(unconfigured)).toEqual([]);
  });
});

describe('confirmEquipmentMaximum', () => {
  it('persists a discovered max without inventing exact loads or an increment', () => {
    const bare = createGymEquipmentInstance({
      trainingLocationId: 'loc-1',
      equipmentDefinitionId: 'eq-1',
      label: 'Some machine',
    });
    const confirmed = confirmEquipmentMaximum(bare, 170);
    expect(confirmed.max_load).toBe(170);
    expect(confirmed.exact_loads).toBeNull();
    expect(confirmed.increment).toBeNull();
    expect(confirmed.version).toBe(bare.version + 1);
  });
});

describe('a maximum on its own (vNext Handoff 04B)', () => {
  const maxOnly = () =>
    createGymEquipmentInstance({
      trainingLocationId: 'loc-1',
      equipmentDefinitionId: 'eq-1',
      label: 'Dumbbells',
      maxLoad: 80,
    });

  it('is real equipment data -- it is enough to cap a recommendation -- but not a load list', () => {
    expect(hasEquipmentData(maxOnly())).toBe(true);
    expect(hasLoadList(maxOnly())).toBe(false);
  });

  it('never synthesizes the loads below it', () => {
    expect(availableLoads(maxOnly())).toEqual([]);
    expect(nextAvailableLoad(maxOnly(), 20)).toBeNull(); // unknown, not "at max"
  });

  it('knows the maximum, so a load at or past it is at the maximum and one below it is not', () => {
    expect(maximumLoad(maxOnly())).toBe(80);
    expect(isAtEquipmentMax(maxOnly(), 80)).toBe(true);
    expect(isAtEquipmentMax(maxOnly(), 85)).toBe(true);
    expect(isAtEquipmentMax(maxOnly(), 75)).toBe(false);
  });

  it('confirmEquipmentMaximum produces exactly this and the confirmed maximum then holds', () => {
    const bare = createGymEquipmentInstance({ trainingLocationId: 'l', equipmentDefinitionId: 'e', label: 'Machine' });
    expect(hasEquipmentData(bare)).toBe(false);
    const confirmed = confirmEquipmentMaximum(bare, 170);
    expect(hasEquipmentData(confirmed)).toBe(true);
    expect(isAtEquipmentMax(confirmed, 170)).toBe(true);
    expect(confirmed.exact_loads).toBeNull();
    expect(confirmed.increment).toBeNull();
  });
});

describe('maximumLoad', () => {
  it('is the last entry of an exact list, whatever max_load says -- the list is authoritative', () => {
    const rack = createGymEquipmentInstance({
      trainingLocationId: 'l',
      equipmentDefinitionId: 'e',
      label: 'Rack',
      exactLoads: [5, 10, 80],
      maxLoad: 200,
    });
    expect(maximumLoad(rack)).toBe(80);
  });

  it('is the last real step of a range, not an unreachable stated maximum', () => {
    const odd = createGymEquipmentInstance({
      trainingLocationId: 'l',
      equipmentDefinitionId: 'e',
      label: 'Odd',
      minLoad: 0,
      maxLoad: 47,
      increment: 15,
    });
    expect(maximumLoad(odd)).toBe(45);
  });

  it('is null for unknown equipment -- a machine only ever lifted to 170 has no known maximum', () => {
    const unknown = createGymEquipmentInstance({ trainingLocationId: 'l', equipmentDefinitionId: 'e', label: 'Unknown' });
    expect(maximumLoad(unknown)).toBeNull();
    expect(isAtEquipmentMax(unknown, 170)).toBe(false);
  });
});

describe('units (no preference exists: weights are lb throughout)', () => {
  it('a new instance defaults to the unit logged history is in, and a kg one stays kg -- nothing converts', () => {
    const lb = createGymEquipmentInstance({ trainingLocationId: 'l', equipmentDefinitionId: 'e', label: 'A', maxLoad: 100 });
    const kg = createGymEquipmentInstance({ trainingLocationId: 'l', equipmentDefinitionId: 'e', label: 'B', maxLoad: 100, unit: 'kg' });
    expect(lb.unit).toBe('lb');
    expect(kg.unit).toBe('kg');
    expect(maximumLoad(kg)).toBe(100); // 100 kg is not turned into 220 lb
  });
});

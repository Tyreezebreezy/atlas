import { describe, expect, it } from 'vitest';
import {
  performanceContextLabel,
  UNSPECIFIED_CONTEXT_LABEL,
  type ContextNames,
} from './contextLabel';

const names: ContextNames = {
  locations: new Map([
    ['main', 'Main Gym'],
    ['hotel', 'Hotel Gym'],
  ]),
  equipment: new Map([
    ['press-1', 'Chest Press #1'],
    ['press-2', 'Chest Press #2'],
    ['hotel-press', 'Chest Press'],
  ]),
};

describe('performanceContextLabel', () => {
  it('names a place and the machine used there', () => {
    expect(
      performanceContextLabel({ training_location_id: 'main', gym_equipment_id: 'press-1' }, names),
    ).toBe('Main Gym — Chest Press #1');
    expect(
      performanceContextLabel({ training_location_id: 'main', gym_equipment_id: 'press-2' }, names),
    ).toBe('Main Gym — Chest Press #2');
    expect(
      performanceContextLabel(
        { training_location_id: 'hotel', gym_equipment_id: 'hotel-press' },
        names,
      ),
    ).toBe('Hotel Gym — Chest Press');
  });

  it('reads history that recorded neither as unspecified / legacy', () => {
    expect(performanceContextLabel({}, names)).toBe(UNSPECIFIED_CONTEXT_LABEL);
    expect(
      performanceContextLabel({ training_location_id: null, gym_equipment_id: null }, names),
    ).toBe('Unspecified / Legacy');
  });

  it('says plainly when a place was recorded but not the machine', () => {
    expect(
      performanceContextLabel({ training_location_id: 'main', gym_equipment_id: null }, names),
    ).toBe('Main Gym — equipment not recorded');
  });

  it('reads a machine with no place by its label alone', () => {
    expect(
      performanceContextLabel({ training_location_id: null, gym_equipment_id: 'press-1' }, names),
    ).toBe('Chest Press #1');
  });

  it('never shows a bare id for a place or machine that no longer exists', () => {
    expect(
      performanceContextLabel({ training_location_id: 'gone', gym_equipment_id: 'press-1' }, names),
    ).toBe('Removed place — Chest Press #1');
    expect(
      performanceContextLabel({ training_location_id: 'main', gym_equipment_id: 'gone' }, names),
    ).toBe('Main Gym — Removed equipment');
    expect(
      performanceContextLabel({ training_location_id: null, gym_equipment_id: 'gone' }, names),
    ).toBe('Removed equipment');
  });

  it('two contexts that differ only by machine read differently', () => {
    const a = performanceContextLabel(
      { training_location_id: 'main', gym_equipment_id: 'press-1' },
      names,
    );
    const b = performanceContextLabel(
      { training_location_id: 'main', gym_equipment_id: 'press-2' },
      names,
    );
    expect(a).not.toBe(b);
  });
});

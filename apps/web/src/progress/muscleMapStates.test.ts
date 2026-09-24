import { describe, expect, it } from 'vitest';
import type { MuscleMapEntry, MuscleMapViewModel } from '@atlas/progress-engine';
import { muscleMapStates } from './muscleMapStates';

function entry(overrides: Partial<MuscleMapEntry> & { muscle_id: string }): MuscleMapEntry {
  return {
    primary_set_count: 0,
    secondary_set_count: 0,
    workout_count: 0,
    last_trained_at: null,
    exercises: [],
    normalized_visual_intensity: 0,
    ...overrides,
  };
}

function model(mode: MuscleMapViewModel['mode'], muscles: MuscleMapEntry[]): MuscleMapViewModel {
  return {
    mode,
    period: { days: 30, start: null, end: null },
    totals: { working_sets: 0, workouts: 0 },
    muscles,
    groups: [],
    empty_reason: null,
  };
}

describe('muscleMapStates', () => {
  it('shades primary work by the domain intensity and shows assist-only muscles as assist (never as fractional heat)', () => {
    const states = muscleMapStates(
      model('volume', [
        entry({ muscle_id: 'chest.mid', primary_set_count: 8, normalized_visual_intensity: 1 }),
        entry({ muscle_id: 'arms.triceps', primary_set_count: 2, normalized_visual_intensity: 0.25 }),
        entry({ muscle_id: 'shoulders.anterior', secondary_set_count: 8 }),
      ]),
    );
    expect(states).toEqual([
      { muscleId: 'chest.mid', state: 'heat', intensity: 1 },
      { muscleId: 'arms.triceps', state: 'heat', intensity: 0.25 },
      { muscleId: 'shoulders.anterior', state: 'assist' },
    ]);
  });

  it('paints nothing for an entry with no activity at all', () => {
    expect(muscleMapStates(model('volume', [entry({ muscle_id: 'chest.mid' })]))).toEqual([]);
  });

  it('maps each performance state to its own tone, never a heat ramp', () => {
    const states = muscleMapStates(
      model('performance', [
        entry({ muscle_id: 'chest.mid', performance_state: 'progressing' }),
        entry({ muscle_id: 'back.lats', performance_state: 'stable' }),
        entry({ muscle_id: 'arms.biceps', performance_state: 'stalled' }),
        entry({ muscle_id: 'quads.quadriceps', performance_state: 'insufficient_data' }),
      ]),
    );
    expect(states.map((s) => [s.muscleId, s.state, s.tone])).toEqual([
      ['chest.mid', 'tone', 'positive'],
      ['back.lats', 'tone', 'neutral'],
      ['arms.biceps', 'tone', 'caution'],
      ['quads.quadriceps', 'tone', 'muted'],
    ]);
  });

  it('outlines selected muscles without replacing their analytic fill', () => {
    const states = muscleMapStates(
      model('volume', [entry({ muscle_id: 'chest.mid', primary_set_count: 4, normalized_visual_intensity: 0.5 })]),
      new Set(['chest.mid']),
    );
    expect(states).toEqual([{ muscleId: 'chest.mid', state: 'heat', intensity: 0.5, selected: true }]);
  });

  it('still outlines a selected muscle that has no activity', () => {
    const states = muscleMapStates(model('volume', []), new Set(['back.lats']));
    expect(states).toEqual([{ muscleId: 'back.lats', state: 'idle', selected: true }]);
  });
});

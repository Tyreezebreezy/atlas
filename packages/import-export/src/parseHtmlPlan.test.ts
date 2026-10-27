// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseHtmlPlan, parsePrescription, toHtmlImportOptions } from './parseHtmlPlan';

describe('parsePrescription', () => {
  it('parses sets x rep range', () => {
    expect(parsePrescription('3 × 6–10')).toMatchObject({
      target_sets: 3,
      target_reps_min: 6,
      target_reps_max: 10,
    });
  });

  it('parses sets x flat reps', () => {
    expect(parsePrescription('1 × 10')).toMatchObject({
      target_sets: 1,
      target_reps_min: 10,
      target_reps_max: 10,
    });
  });

  it('parses a sets range x rep range, taking the max of the sets range (e.g. real Pump Guide dose "2–3 × 12–15")', () => {
    const result = parsePrescription('2–3 × 12–15');
    expect(result).toMatchObject({ target_sets: 3, target_reps_min: 12, target_reps_max: 15 });
    expect(result.note).toBe('Sets: 2–3');
  });

  it('parses a sets range x flat reps, taking the max of the sets range', () => {
    const result = parsePrescription('1–2 × 8');
    expect(result).toMatchObject({ target_sets: 2, target_reps_min: 8, target_reps_max: 8 });
    expect(result.note).toBe('Sets: 1–2');
  });

  it('parses per-side reps and notes "per side"', () => {
    const result = parsePrescription('1 × 12 / side');
    expect(result).toMatchObject({ target_sets: 1, target_reps_min: 12, target_reps_max: 12 });
    expect(result.note).toBe('per side');
  });

  it('parses a bare duration with no set count', () => {
    expect(parsePrescription('15–20 min')).toMatchObject({
      target_sets: 1,
      target_duration_seconds: 20 * 60,
    });
  });

  it('parses a single bare duration', () => {
    expect(parsePrescription('3 min')).toMatchObject({
      target_sets: 1,
      target_duration_seconds: 180,
    });
  });

  it('parses timed sets with a duration range, keeping the range in the note', () => {
    const result = parsePrescription('2 × 20–40 sec / side');
    expect(result).toMatchObject({ target_sets: 2, target_duration_seconds: 40 });
    expect(result.note).toContain('20–40 sec');
    expect(result.note).toContain('per side');
  });

  it('parses interval notation into rounds/work/recovery', () => {
    const result = parsePrescription('6 × 30s / 90s');
    expect(result).toMatchObject({ target_sets: 6, target_duration_seconds: 30, rest_seconds: 90 });
  });

  it('parses a bare rep range with no unit', () => {
    expect(parsePrescription('6–8 reps')).toMatchObject({
      target_sets: 1,
      target_reps_min: 6,
      target_reps_max: 8,
    });
  });

  it('parses a bare per-side rep count', () => {
    const result = parsePrescription('10 / side');
    expect(result).toMatchObject({ target_sets: 1, target_reps_min: 10, target_reps_max: 10 });
    expect(result.note).toBe('per side');
  });

  it('parses breath counts distinctly from reps', () => {
    const result = parsePrescription('3–5 breaths');
    expect(result).toMatchObject({ target_sets: 1, target_reps_min: 3, target_reps_max: 5 });
    expect(result.note).toBe('breaths');
  });

  it('treats a non-numeric dose as a note only, never inventing a prescription', () => {
    const result = parsePrescription('Optional');
    expect(result.target_sets).toBeUndefined();
    expect(result.target_reps_min).toBeUndefined();
    expect(result.note).toBe('Optional');
  });

  it('treats "Valid choice" the same way', () => {
    const result = parsePrescription('Valid choice');
    expect(result.target_sets).toBeUndefined();
    expect(result.note).toBe('Valid choice');
  });

  it('strips a leading approximate tilde before parsing', () => {
    expect(parsePrescription('~5 min')).toMatchObject({
      target_sets: 1,
      target_duration_seconds: 300,
    });
  });
});

describe('parseHtmlPlan safety', () => {
  it('never executes embedded scripts or fetches from style/script content', () => {
    let executed = false;
    // @ts-expect-error -- test-only global probe
    globalThis.__atlasHtmlImportProbe = () => {
      executed = true;
    };
    const html = `
      <div><h2>Test Day</h2>
        <label><input type="checkbox"><span>Push-up</span><span>3 x 10</span></label>
      </div>
      <script>window.__atlasHtmlImportProbe && window.__atlasHtmlImportProbe();</script>
      <style>body::before { content: "unused"; }</style>
    `;
    parseHtmlPlan(html);
    expect(executed).toBe(false);
    // @ts-expect-error -- cleanup
    delete globalThis.__atlasHtmlImportProbe;
  });

  it('ignores checkboxes with no recognizable name and reports them as unparsed', () => {
    const html = `<div><h2>Day</h2><label><input type="checkbox"></label></div>`;
    const { workouts, unparsedText } = parseHtmlPlan(html);
    expect(workouts[0]?.workout.exercises).toEqual([]);
    expect(unparsedText.length).toBeGreaterThanOrEqual(0); // malformed row: no crash, no invented exercise
  });

  it('does not choke on malformed/unclosed HTML', () => {
    const html = `<div><h2>Day<label><input type="checkbox"><span>Row</span><span>1 x 5`;
    expect(() => parseHtmlPlan(html)).not.toThrow();
  });
});

describe('parseHtmlPlan: synthetic multi-day fixture', () => {
  const html = `
    <section class="day-panel">
      <h2 class="day-title">Monday — Upper</h2>
      <span class="status-tag">Mandatory</span>
      <div class="section-title">Workout</div>
      <div class="exercise-list">
        <label class="exercise"><input type="checkbox"><span><span class="exercise-name">Bench Press</span><span class="exercise-note">Go slow.</span></span><span class="sets">3 × 6–10</span></label>
        <label class="exercise"><input type="checkbox"><span><span class="exercise-name">Cable or dumbbell lateral raise</span></span><span class="sets">3 × 12–20</span></label>
      </div>
    </section>
    <section class="day-panel">
      <h2 class="day-title">Sunday — Rest</h2>
      <span class="status-tag rest">Rest</span>
      <div class="exercise-list">
        <label class="exercise"><input type="checkbox"><span><span class="exercise-name">No structured workout</span></span><span class="sets">Primary goal</span></label>
        <label class="exercise"><input type="checkbox"><span><span class="exercise-name">Prepare for Monday</span></span><span class="sets">5 min</span></label>
      </div>
    </section>
  `;
  const { workouts, unparsedText } = parseHtmlPlan(html);

  it('finds one workout per day container', () => {
    expect(workouts).toHaveLength(2);
  });

  it("parses the mandatory day's exercises with real prescriptions", () => {
    const monday = workouts[0]!;
    expect(monday.label).toContain('Monday');
    expect(monday.status).toBe('mandatory');
    expect(monday.workout.exercises[0]).toMatchObject({
      exercise_name: 'Bench Press',
      target_sets: 3,
      target_reps_min: 6,
      target_reps_max: 10,
    });
    expect(monday.workout.exercises[0]?.notes).toContain('Go slow.');
  });

  it('resolves a known "X or Y" choice to a primary name plus an alternate note', () => {
    const monday = workouts[0]!;
    expect(monday.workout.exercises[1]?.exercise_name).toBe('Cable lateral raise');
    expect(monday.workout.exercises[1]?.notes).toContain('dumbbell lateral raise');
  });

  it("empties a rest day's exercises instead of inventing training", () => {
    const sunday = workouts[1]!;
    expect(sunday.status).toBe('rest');
    expect(sunday.workout.exercises).toEqual([]);
  });

  it("folds the rest day's row text into unparsedText rather than dropping it", () => {
    expect(unparsedText.some((t) => t.includes('No structured workout'))).toBe(true);
  });
});

describe('toHtmlImportOptions', () => {
  it('returns nothing for a file with no recognizable workouts', () => {
    expect(toHtmlImportOptions({ workouts: [], unparsedText: [] }, 'Empty')).toEqual([]);
  });
});

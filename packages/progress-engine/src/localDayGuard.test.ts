import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * vNext Handoff 04B. "Which day did this workout happen on?" has one answer, in
 * `@atlas/core`'s `sessionLocalDate` (the local day stored on the session, else
 * the viewer-local day of its completion), and week and day boundaries come from
 * the same Monday-first local helpers. The bug this pins shut: slicing the first
 * ten characters of an ISO timestamp is the UTC date, which put a 9 pm Sunday
 * workout in the US into Monday -- and into the next week.
 *
 * Pinned by reading the source, for every place that buckets by day or week:
 * the progress, milestone and PR engines, the program schedule, the shared date
 * helpers, and the Today / Progress / History screens.
 *
 * Calendar arithmetic on a date that is already a `YYYY-MM-DD` string is fine
 * (`Date.UTC(y, m, d)`, `addDaysToIso`); what is not is turning an instant into
 * a date any way other than `localDateOfInstant` / `sessionLocalDate`.
 */
const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const ROOTS = [
  'packages/progress-engine/src',
  'packages/milestone-engine/src',
  'packages/program-engine/src',
  'packages/pr-engine/src',
  'packages/core/src',
  'apps/web/src/today',
  'apps/web/src/progress',
  'apps/web/src/history',
];

/** Fixtures build timestamps on purpose; they are test support, not logic. */
const EXEMPT = ['packages/progress-engine/src/testFixtures.ts'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Comments may describe the forbidden patterns (this very rule is explained in some); only code counts. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = ROOTS.flatMap((root) => sourceFiles(join(REPO, root)))
  .map((full) => ({
    path: relative(REPO, full).replace(/\\/g, '/'),
    text: readFileSync(full, 'utf8'),
  }))
  .filter((f) => !EXEMPT.includes(f.path))
  .map((f) => ({ ...f, code: withoutComments(f.text) }));

const offending = (pattern: RegExp) =>
  files
    .filter((f) => pattern.test(f.code))
    .map((f) => f.path)
    .sort();
const textOf = (path: string) => files.find((f) => f.path === path)?.text ?? '';

describe('no day or week is ever taken from the UTC date', () => {
  it('scans the places that matter (so an emptied list cannot pass by scanning nothing)', () => {
    expect(files.length).toBeGreaterThan(25);
    expect(files.map((f) => f.path)).toEqual(
      expect.arrayContaining([
        'packages/progress-engine/src/buildWeeklyReview.ts',
        'packages/progress-engine/src/activityHeatmap.ts',
        'packages/milestone-engine/src/evaluateMilestones.ts',
        'packages/pr-engine/src/prEvents.ts',
        'packages/core/src/localDate.ts',
        'apps/web/src/today/TodayScreen.tsx',
        'apps/web/src/history/HistoryScreen.tsx',
      ]),
    );
  });

  it('no ten-character slice of a string is used to get a date', () => {
    expect(offending(/\.(?:slice|substring|substr)\(\s*0\s*,\s*10\s*\)/)).toEqual([]);
  });

  it('no ISO string is split at the T to get a date', () => {
    expect(offending(/\.split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]/)).toEqual([]);
  });

  it('no ISO string produced by toISOString() is cut up into a date', () => {
    expect(offending(/\.toISOString\(\)\s*\.(?:slice|substring|substr|split)\b/)).toEqual([]);
  });

  it('nothing reads a calendar part in UTC', () => {
    expect(offending(/\b(?:getUTC(?:Date|Day|Month|FullYear)|setUTCDate)\b/)).toEqual([]);
  });
});

describe('every day and week bucket goes through the one shared definition', () => {
  const SHARED = /\b(?:sessionLocalDate|localDateOfInstant)\b/;

  it('the weekly review, the heatmap, the milestone engine and the PR event planner use it', () => {
    for (const path of [
      'packages/progress-engine/src/buildWeeklyReview.ts',
      'packages/progress-engine/src/activityHeatmap.ts',
      'packages/milestone-engine/src/evaluateMilestones.ts',
      'packages/pr-engine/src/prEvents.ts',
    ]) {
      expect(textOf(path), path).toMatch(SHARED);
      expect(textOf(path), path).toMatch(/from\s*['"]@atlas\/core['"]/);
    }
  });

  it('History and Log Past Workout use it too', () => {
    for (const path of [
      'apps/web/src/history/HistoryScreen.tsx',
      'apps/web/src/history/LogPastWorkoutScreen.tsx',
    ]) {
      expect(textOf(path), path).toMatch(SHARED);
    }
  });

  it('weeks start on Monday through the shared helper, not a second copy of the rule', () => {
    expect(textOf('packages/program-engine/src/weekPlan.ts')).toMatch(
      /export\s*\{[^}]*startOfWeekIso[^}]*\}\s*from\s*['"]@atlas\/core['"]/,
    );
    expect(
      offending(/function\s+startOfWeek\w*\s*\(/).filter(
        (path) => path !== 'packages/core/src/localDate.ts',
      ),
    ).toEqual([]);
  });
});

describe('a workout date label is its local day, never the viewer-local day of its instant', () => {
  // Acceptance pass. Formatting `new Date(session.completed_at)` labels a workout with the day in whatever timezone
  // the phone is in NOW, so after travelling History says one day and the exercise's own history another.
  const web = sourceFiles(join(REPO, 'apps/web/src')).map((full) => ({
    path: relative(REPO, full).replace(/\\/g, '/'),
    text: readFileSync(full, 'utf8'),
  }));

  it('no screen turns a session timestamp into a date string', () => {
    const instantLabel = /new Date\([^)]*(?:completed_at|started_at)[^)]*\)\s*\.toLocale\w*/;
    expect(
      web.filter((f) => instantLabel.test(withoutComments(f.text))).map((f) => f.path),
    ).toEqual([]);
  });

  it('the per-exercise history and the Gym Mode history sheet label through the one helper', () => {
    for (const path of [
      'apps/web/src/library/ExerciseProgress.tsx',
      'apps/web/src/gym/ExerciseContextSheet.tsx',
    ]) {
      expect(web.find((f) => f.path === path)?.text, path).toMatch(/\bformatSessionDate\b/);
    }
  });
});

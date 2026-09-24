import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * vNext Handoff 04A. Two things this app must not drift back into, pinned by
 * reading the source (the same way `singleRenderer.test.ts` pins one body map):
 *
 * - one benchmark authority: current comparisons come only from
 *   `evaluateBenchmarkStrict`; the legacy interpolation is never called;
 * - one "PRs this week" figure: Today and Progress read the weekly review's
 *   headline count and never count PersonalRecord rows themselves.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const files = sourceFiles(SRC).map((full) => ({
  path: relative(SRC, full).replace(/\\/g, '/'),
  text: readFileSync(full, 'utf8'),
}));
const text = (path: string) => files.find((f) => f.path === path)?.text ?? '';
const filesContaining = (needle: string | RegExp) =>
  files
    .filter((f) => (typeof needle === 'string' ? f.text.includes(needle) : needle.test(f.text)))
    .map((f) => f.path)
    .sort();

describe('one benchmark authority', () => {
  it('no user-facing code imports or calls the legacy interpolation', () => {
    expect(filesContaining('interpolatePercentile')).toEqual([]);
  });

  it('exactly one place evaluates a benchmark for display, and it uses the strict evaluator', () => {
    expect(filesContaining('evaluateBenchmarkStrict(')).toEqual(['progress/BenchmarkComparisons.tsx']);
    expect(filesContaining('formatPercentileDisplay(')).toEqual(['progress/BenchmarkComparisons.tsx']);
  });

  it('nothing else derives a percentile from a Benchmark row\'s thresholds', () => {
    expect(filesContaining('percentile_thresholds')).toEqual([]);
  });
});

describe('one headline PR count', () => {
  it('Today and Progress Overview both build their week from buildWeeklyReview, and nothing else does', () => {
    expect(filesContaining('buildWeeklyReview(')).toEqual(['progress/OverviewView.tsx', 'today/TodayScreen.tsx']);
  });

  it('neither counts PersonalRecord rows itself -- they display the review\'s pr_count', () => {
    for (const path of ['today/TodayScreen.tsx', 'progress/OverviewView.tsx']) {
      const source = text(path);
      expect(source, path).toContain('.pr_count');
      // Counting rows would mean `.length` of a PR array, or filtering rows to a week.
      expect(source, path).not.toMatch(/\b(personalRecords|prs|records)\b\s*(\.filter\([^)]*\))?\s*\.length/);
    }
  });

  it('only those two screens show the count, and both read it from the review', () => {
    expect(filesContaining('.pr_count')).toEqual(['progress/OverviewView.tsx', 'today/TodayScreen.tsx']);
  });
});

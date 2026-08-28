import type { BenchmarkEvidenceGrade } from '@atlas/data-model';

/**
 * Bumped whenever the values/methodology below change, so a future
 * recalculation can distinguish "same model, new performance" from "the
 * model itself changed." See docs/BENCHMARKS.md for the full methodology,
 * per-metric source citations, and evidence-grade definitions.
 */
export const BENCHMARK_DATASET_VERSION = 'atlas-benchmarks-2026.1';

export interface BenchmarkSpec {
  metric: string;
  /** Resolved to a real exercise id at seed time, name-matched like curatedEnrichment/builtInMilestones. Null when the metric isn't tied to a loggable ATLAS exercise (e.g. a dynamometer test). */
  exerciseName: string | null;
  ageMin: number | null;
  ageMax: number | null;
  ageGroup: string | null;
  comparisonPopulation: string;
  percentileThresholds: Record<string, number>;
  source: string;
  sourceUrl: string | null;
  sampleDescription: string | null;
  year: number | null;
  method: string | null;
  notes: string | null;
  evidenceGrade: BenchmarkEvidenceGrade;
}

// Researched 2026-08-28 via web search (not from memory alone, per the
// v0.0.7 handoff's explicit instruction) -- see docs/BENCHMARKS.md for the
// full per-metric writeup of what was found vs. modeled. None of these
// reproduce a source's full copyrighted table verbatim; each stores only
// the handful of percentile points ATLAS needs, filled out with a
// documented, versioned ATLAS interpolation where the found data was
// qualitative (e.g. "excellent starts around 29 reps") rather than a full
// percentile table.
export const BENCHMARK_SPECS: BenchmarkSpec[] = [
  {
    metric: 'pushups',
    exerciseName: 'push-up',
    ageMin: 18,
    ageMax: 65,
    ageGroup: 'adult',
    comparisonPopulation: 'general adult men',
    percentileThresholds: { '10': 5, '25': 12, '50': 19, '75': 24, '90': 30, '95': 38, '99': 55 },
    source:
      'ATLAS model from ACSM Health-Related Physical Fitness Assessment Manual (5th ed., 2024) category anchors',
    sourceUrl: null,
    sampleDescription:
      'ACSM-published categorical anchors (e.g. "excellent" >= ~29 reps for a 30-year-old man); full percentile table not reproduced here -- see notes',
    year: 2024,
    method:
      'ATLAS-modeled percentile curve fitted to ACSM\'s published category anchors ("average" 17-21, "excellent" 29+ for age ~30), not a literal copy of ACSM\'s own table',
    notes:
      'Category anchors found via web search summarizing ACSM 5th ed.; the full table above is an ATLAS interpolation between those anchors, not sourced point-for-point. Age bracket is a single broad "adult" band -- ATLAS does not yet collect user age to select a narrower one.',
    evidenceGrade: 'D',
  },
  {
    metric: 'pullups',
    exerciseName: 'pull-up',
    ageMin: 18,
    ageMax: 65,
    ageGroup: 'adult',
    comparisonPopulation: 'general adult men',
    percentileThresholds: { '10': 1, '25': 4, '50': 8, '75': 12, '90': 16, '95': 20, '99': 25 },
    source: 'ATLAS model from commonly cited pull-up fitness-test category norms',
    sourceUrl: null,
    sampleDescription:
      'Aggregated fitness-test category norms (e.g. "average" 7-9, "good" 10-15, "excellent" 16+ for adult men); full percentile table not reproduced here -- see notes',
    year: 2026,
    method:
      'ATLAS-modeled percentile curve fitted to the found category anchors, same approach as pushups',
    notes:
      'Weaker evidence than pushups -- no single named institutional source, several convenience-sample fitness-test norm pages broadly agree on the same category anchors. Treat as directional, not precise.',
    evidenceGrade: 'D',
  },
  {
    metric: 'bench_press_1rm_lb',
    exerciseName: 'barbell bench press',
    ageMin: 18,
    ageMax: 65,
    ageGroup: 'adult',
    comparisonPopulation: 'general adult men',
    percentileThresholds: { '5': 95, '20': 155, '50': 225, '80': 284, '95': 352, '99': 405 },
    source:
      'ATLAS model informed by Strength Level aggregated lift data (48.7M+ user-logged lifts, 2014-2026)',
    sourceUrl: 'https://strengthlevel.com/strength-standards/bench-press/lb',
    sampleDescription:
      'Self-selected app users who log lifts, not a population survey -- skews toward people who train and track; standards shown calibrated around a ~180 lb (~82 kg) reference lifter, not adjusted per-user by bodyweight in this version',
    year: 2026,
    method:
      'The 50/80/95 points are Strength Level\'s own "Intermediate/Advanced/Elite" standards for a 180 lb lifter; the 5/20/99 points are ATLAS-modeled to complete the curve since only three named categories were found',
    notes:
      "Absolute-weight percentiles only in v0.0.7 -- not bucketed by the lifter's own bodyweight, which is what real strength standards normally condition on (a 150 lb man and a 250 lb man benching the same weight are not equally strong relative to bodyweight). Documented simplification, not an oversight -- see docs/BENCHMARKS.md.",
    evidenceGrade: 'D',
  },
  {
    metric: 'grip_strength_kg',
    exerciseName: null,
    ageMin: 25,
    ageMax: 29,
    ageGroup: '25-29',
    comparisonPopulation: 'general adult men',
    percentileThresholds: { '10': 38, '25': 44, '50': 50, '75': 56, '90': 61, '95': 65, '99': 72 },
    source:
      'ATLAS model anchored to NHANES-derived hand-grip strength normative data (JOSPT 2018 normative reference paper)',
    sourceUrl: 'https://www.jospt.org/doi/10.2519/jospt.2018.7851',
    sampleDescription:
      'NHANES (CDC national health survey) dominant-hand dynamometer measurements, ages 25-29: mean ~49.7 kg, ~37.7-57.5 kg range',
    year: 2018,
    method:
      "ATLAS-modeled percentile curve anchored to the real published mean (49.7 kg) and range (37.7-57.5 kg) for this age band -- not the source's own full percentile table, which was not reproduced here",
    notes:
      'Strongest evidence base of the metrics seeded so far (a real government health survey, not a fitness-app convenience sample) -- still graded D rather than B/C because the interpolated table itself is an ATLAS construction around published summary statistics, not a copy of an official percentile table. Not tied to a loggable ATLAS exercise (no grip-strength "exercise" exists to attach a workout set to), so this is seeded for completeness but not yet surfaced anywhere in the v0.0.7 UI.',
    evidenceGrade: 'D',
  },
  {
    metric: 'plank_seconds',
    exerciseName: 'weighted front plank',
    ageMin: 18,
    ageMax: 30,
    ageGroup: '18-30',
    comparisonPopulation: 'general adult men',
    percentileThresholds: {
      '10': 45,
      '25': 80,
      '50': 108,
      '75': 130,
      '90': 165,
      '95': 195,
      '99': 240,
    },
    source: 'ATLAS model anchored to published collegiate plank-hold studies',
    sourceUrl: null,
    sampleDescription:
      'College-aged (18-25) men, two independent studies: 25th/50th/75th percentiles of roughly 77-84s / 106-110s / 128.5-135s',
    year: 2014,
    method:
      'ATLAS-modeled percentile curve anchored to the found 25th/50th/75th points; the 10th/90th/95th/99th tail points are ATLAS extrapolations beyond what either study reported',
    notes:
      "Age band reflects the studies' own college-aged samples, narrower than the other metrics here -- applied as the fallback bracket for all ages since ATLAS has no age input yet, which is an acknowledged mismatch worth revisiting once real age-banded data exists.",
    evidenceGrade: 'D',
  },
];

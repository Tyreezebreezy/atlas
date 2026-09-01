import type { PlanExerciseTarget, PlanProgram, PlanWorkout } from './types';

export interface ParsedPasteText {
  result: { kind: 'workout'; workout: PlanWorkout } | { kind: 'program'; program: PlanProgram };
  /** Lines the parser could not classify as a day header, exercise, set/rep
   * line, rest line, or weight line -- surfaced so the preview can show them
   * as "parsing assumptions" rather than silently dropping them. */
  unparsedLines: string[];
}

const DAY_HEADER_RE =
  /^(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b\s*[-–—:]?\s*(.*)$/i;

const SETS_REPS_RE =
  /^(\d+)\s*(?:sets?)?\s*[x×]\s*(\d+(?:\s*-\s*\d+)?|amrap)\s*(?:reps?)?\s*(?:@\s*(\d+(?:\.\d+)?)\s*(lbs?|kgs?))?\s*$/i;

const REST_MMSS_RE = /^rest\s*:?\s*(\d+):(\d{2})\s*$/i;
const REST_UNIT_RE = /^rest\s*:?\s*(\d+)\s*(min(?:ute)?s?|sec(?:ond)?s?|s)?\s*$/i;

const WEIGHT_ONLY_RE = /^@?\s*(\d+(?:\.\d+)?)\s*(lbs?|kgs?)\s*$/i;

const HAS_LETTER_RE = /[a-z]/i;

function toRestSeconds(match: RegExpMatchArray, kind: 'mmss' | 'unit'): number {
  if (kind === 'mmss') {
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    return minutes * 60 + seconds;
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? 'min').toLowerCase();
  return unit.startsWith('s') ? amount : amount * 60;
}

function newExerciseTarget(name: string, order: number): PlanExerciseTarget {
  return {
    order,
    exercise_id: null,
    exercise_name: name,
    target_sets: null,
    target_reps_min: null,
    target_reps_max: null,
    target_weight: null,
    target_rpe: null,
    target_rir: null,
    target_duration_seconds: null,
    target_distance_meters: null,
    rest_seconds: null,
    notes: null,
  };
}

function applyWeight(target: PlanExerciseTarget, amount: number, unit: string): void {
  const kg = unit.toLowerCase().startsWith('kg') ? amount * 2.20462 : amount;
  target.target_weight = Math.round(kg * 100) / 100;
}

/** Parses one day's worth of lines (no day-header lines among them) into a
 * PlanWorkout. Deterministic, regex-based -- no embedded LLM, per
 * docs/IMPORT_FORMAT.md. Ambiguous lines are preserved as a new exercise name
 * rather than dropped; the caller surfaces true misses via `unparsedLines`. */
function parseWorkoutLines(lines: string[], name: string, unparsedLines: string[]): PlanWorkout {
  const exercises: PlanExerciseTarget[] = [];
  let current: PlanExerciseTarget | null = null;
  let order = 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!HAS_LETTER_RE.test(line) && !SETS_REPS_RE.test(line)) {
      // A line of pure punctuation/dashes (a visual separator) -- not real content.
      continue;
    }

    const setsRepsMatch = line.match(SETS_REPS_RE);
    if (setsRepsMatch && current) {
      const sets = Number(setsRepsMatch[1]);
      const repsToken = (setsRepsMatch[2] ?? '').toLowerCase();
      current.target_sets = sets;
      if (repsToken === 'amrap') {
        current.notes = current.notes ? `${current.notes}; AMRAP` : 'AMRAP';
      } else if (repsToken.includes('-')) {
        const [minText, maxText] = repsToken.split('-').map((part) => part.trim());
        current.target_reps_min = Number(minText);
        current.target_reps_max = Number(maxText);
      } else {
        current.target_reps_min = Number(repsToken);
        current.target_reps_max = Number(repsToken);
      }
      const weightAmount = setsRepsMatch[3];
      const weightUnit = setsRepsMatch[4];
      if (weightAmount && weightUnit) applyWeight(current, Number(weightAmount), weightUnit);
      continue;
    }

    const restMmss = line.match(REST_MMSS_RE);
    if (restMmss && current) {
      current.rest_seconds = toRestSeconds(restMmss, 'mmss');
      continue;
    }
    const restUnit = line.match(REST_UNIT_RE);
    if (restUnit && current) {
      current.rest_seconds = toRestSeconds(restUnit, 'unit');
      continue;
    }

    const weightOnly = line.match(WEIGHT_ONLY_RE);
    if (weightOnly && current) {
      applyWeight(current, Number(weightOnly[1]), weightOnly[2] ?? 'lbs');
      continue;
    }

    if (SETS_REPS_RE.test(line) || REST_MMSS_RE.test(line) || REST_UNIT_RE.test(line)) {
      // Matched a sets/rest pattern but there's no exercise yet to attach it to.
      unparsedLines.push(rawLine);
      continue;
    }

    current = newExerciseTarget(line, order);
    order += 1;
    exercises.push(current);
  }

  return { name, is_quick_workout: false, exercises };
}

/** Splits pasted text into day blocks wherever a weekday-header line appears.
 * Zero or one day header -> a single workout. Two or more -> a program with
 * one day per block, sequenced by appearance order (not calendar-aware, per
 * the "no giant calendar engine" guidance applied to Stage 4A). */
export function parsePasteText(text: string): ParsedPasteText {
  const allLines = text.split(/\r?\n/);
  const unparsedLines: string[] = [];

  const blocks: { label: string; lines: string[] }[] = [];
  let currentBlock: { label: string; lines: string[] } | null = null;

  for (const rawLine of allLines) {
    const line = rawLine.trim();
    const headerMatch = line.match(DAY_HEADER_RE);
    if (headerMatch) {
      const rest = (headerMatch[2] ?? '').trim();
      const weekday = capitalize(headerMatch[1] ?? '');
      const label = rest.length > 0 ? `${weekday} — ${rest}` : weekday;
      currentBlock = { label, lines: [] };
      blocks.push(currentBlock);
      continue;
    }
    if (currentBlock) {
      currentBlock.lines.push(rawLine);
    } else {
      // No day header seen yet -- start an implicit single block.
      currentBlock = { label: '', lines: [rawLine] };
      blocks.push(currentBlock);
    }
  }

  if (blocks.length <= 1) {
    const block = blocks[0] ?? { label: '', lines: [] };
    const workout = parseWorkoutLines(
      block.lines,
      block.label || 'Imported Workout',
      unparsedLines,
    );
    return { result: { kind: 'workout', workout }, unparsedLines };
  }

  const days = blocks.map((block) => ({
    label: block.label || 'Imported Day',
    workout: parseWorkoutLines(block.lines, block.label || 'Imported Day', unparsedLines),
  }));
  const program: PlanProgram = {
    name: 'Imported Program',
    description: null,
    weeks: [{ label: null, days }],
  };
  return { result: { kind: 'program', program }, unparsedLines };
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

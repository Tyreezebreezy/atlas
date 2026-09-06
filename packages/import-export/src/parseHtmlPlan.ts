import type { ParsedPlanInput } from './buildImportPreview';
import type { PlanExerciseGroup, PlanExerciseTarget, PlanProgram, PlanWorkout } from './types';

function isDoseLike(s: string): boolean {
  return /\d/.test(s) || /^(optional|as desired|valid choice|primary goal)$/i.test(s.trim());
}

export type ParsedWorkoutStatus = 'mandatory' | 'optional' | 'rest';

export interface ParsedHtmlWorkout {
  label: string;
  status: ParsedWorkoutStatus | null;
  workout: PlanWorkout;
}

export interface ParsedHtmlPlan {
  workouts: ParsedHtmlWorkout[];
  /** Row text this parser found but could not turn into an exercise (e.g. a
   * checkbox row with no recognizable name) -- surfaced rather than dropped
   * silently, same convention as parsePasteText's unparsedLines. */
  unparsedText: string[];
}

const STATUS_WORDS = new Set(['mandatory', 'optional', 'rest']);

/** A day's Mandatory/Optional/Rest status, if this container has a small
 * dedicated badge element for it -- an exact (not substring) match on a
 * short descendant's own text, so a sentence like "Rest: 20-40 seconds
 * between sets" elsewhere in the container never gets mistaken for a
 * rest-day badge. */
function findStatus(container: Element): ParsedWorkoutStatus | null {
  for (const el of Array.from(container.querySelectorAll('*'))) {
    if (el.children.length > 0) continue; // only leaf elements are badge candidates
    const text = el.textContent?.trim().toLowerCase() ?? '';
    if (STATUS_WORDS.has(text)) return text as ParsedWorkoutStatus;
  }
  return null;
}

/**
 * Known "X or Y" choice phrasings from real source documents, reviewed by
 * hand (not guessed) -- see docs/IMPORT_FORMAT.md "Exercise choice syntax."
 * `PlannedExercise` has no "alternates" field of its own, so rather than
 * inventing one, the primary goes through the normal name-matching path
 * like any other imported exercise and the alternate is preserved as a
 * plain-text note -- visible, not hidden, without new schema. Any "X or Y"
 * text NOT in this table is left as its full literal compound string,
 * which the normal exercise-matching pass will almost certainly fail to
 * resolve -- correctly surfacing it in the import preview as unresolved,
 * exactly the "otherwise: mark the choice, require explicit resolution"
 * fallback the spec calls for.
 */
const KNOWN_CHOICES: Record<string, { primary: string; alternate: string }> = {
  'cable or dumbbell lateral raise': {
    primary: 'Cable lateral raise',
    alternate: 'dumbbell lateral raise',
  },
  'reverse pec deck or rear-delt fly': {
    primary: 'Reverse pec deck',
    alternate: 'rear-delt fly',
  },
  'seated or lying leg curl': { primary: 'Seated leg curl', alternate: 'lying leg curl' },
  'standing or seated calf raise': {
    primary: 'Standing calf raise',
    alternate: 'seated calf raise',
  },
  'dumbbell or machine shoulder press': {
    primary: 'Dumbbell shoulder press',
    alternate: 'machine shoulder press',
  },
  'low-incline machine or dumbbell press': {
    primary: 'Low-incline machine press',
    alternate: 'dumbbell press',
  },
  'reverse pec deck or face pull': { primary: 'Reverse pec deck', alternate: 'face pull' },
  'push-up progression or assisted dip': {
    primary: 'Push-up progression',
    alternate: 'assisted dip',
  },
  'hanging knee raise or reverse crunch': {
    primary: 'Hanging knee raise',
    alternate: 'reverse crunch',
  },
  'bike or elliptical': { primary: 'Bike', alternate: 'elliptical' },
  'bike or elliptical intervals': { primary: 'Bike intervals', alternate: 'elliptical intervals' },
};

function resolveChoice(name: string): { name: string; note: string | null } {
  const known = KNOWN_CHOICES[name.trim().toLowerCase()];
  return known
    ? { name: known.primary, note: `Alternate: ${known.alternate}` }
    : { name, note: null };
}

function maxOfRange(token: string): number {
  const parts = token.split(/[-–]/).map((p) => Number(p.trim()));
  return Math.max(...parts);
}

function isRange(token: string): boolean {
  return /[-–]/.test(token);
}

/**
 * Turns one dose/prescription string (e.g. "3 × 6–10", "2 × 20–40 sec /
 * side", "15–20 min", "6 × 30s / 90s") into the closest fit on
 * `PlanExerciseTarget`'s numeric fields, tried in order from most to least
 * specific. `PlanExerciseTarget` has a single `target_duration_seconds`
 * (no min/max pair like reps has), so a duration *range* stores its max as
 * the target and keeps the literal range in the note rather than silently
 * rounding it away. Never invented: a dose this doesn't recognize (e.g.
 * "Optional", "Valid choice") produces no numeric fields at all, just the
 * original text preserved verbatim as a note.
 */
export function parsePrescription(
  doseRaw: string,
): Partial<PlanExerciseTarget> & { note: string | null } {
  const dose = doseRaw.replace(/^~\s*/, '').trim();
  const perSide = /\/\s*side\b/i.test(dose);
  const base = dose.replace(/\/\s*side\b/i, '').trim();
  const sideNote = perSide ? 'per side' : null;
  const withSideNote = (note: string | null): string | null =>
    [note, sideNote].filter((n): n is string => n !== null).join('; ') || null;

  // "6 × 30s / 90s" -- interval rounds: work seconds / recovery seconds.
  let m = base.match(
    /^(\d+)\s*[x×]\s*(\d+)\s*s(?:ec(?:onds?)?)?\s*\/\s*(\d+)\s*s(?:ec(?:onds?)?)?$/i,
  );
  if (m?.[1] && m[2] && m[3]) {
    return {
      target_sets: Number(m[1]),
      target_duration_seconds: Number(m[2]),
      rest_seconds: Number(m[3]),
      note: withSideNote(`Intervals: ${m[1]} rounds of ${m[2]}s work / ${m[3]}s recovery`),
    };
  }

  // "N × A–B sec/min" or "N × A sec/min" -- timed sets, optionally a range.
  m = base.match(/^([\d–-]+)\s*[x×]\s*([\d.–-]+)\s*(sec(?:onds?)?|min(?:utes?)?)$/i);
  if (m?.[1] && m[2] && m[3]) {
    const unit = m[3].toLowerCase().startsWith('s') ? 1 : 60;
    const durationSeconds = Math.round(maxOfRange(m[2]) * unit);
    const notes = [isRange(m[2]) ? `Range: ${m[2]} ${m[3]}` : null];
    return {
      target_sets: Math.round(maxOfRange(m[1])),
      target_duration_seconds: durationSeconds,
      note: withSideNote(notes.filter(Boolean).join('; ') || null),
    };
  }

  // "N × A–B" or "N × A" -- rep range or a flat rep count.
  m = base.match(/^(\d+)\s*[x×]\s*(\d+)\s*[-–]\s*(\d+)$/);
  if (m?.[1] && m[2] && m[3]) {
    return {
      target_sets: Number(m[1]),
      target_reps_min: Number(m[2]),
      target_reps_max: Number(m[3]),
      note: withSideNote(null),
    };
  }
  m = base.match(/^(\d+)\s*[x×]\s*(\d+)$/);
  if (m?.[1] && m[2]) {
    return {
      target_sets: Number(m[1]),
      target_reps_min: Number(m[2]),
      target_reps_max: Number(m[2]),
      note: withSideNote(null),
    };
  }

  // Bare timed activity, no explicit set count: "15–20 min", "3 min", "20–30 sec".
  m = base.match(/^([\d.–-]+)\s*(sec(?:onds?)?|min(?:utes?)?)$/i);
  if (m?.[1] && m[2]) {
    const unit = m[2].toLowerCase().startsWith('s') ? 1 : 60;
    return {
      target_sets: 1,
      target_duration_seconds: Math.round(maxOfRange(m[1]) * unit),
      note: withSideNote(isRange(m[1]) ? `Range: ${m[1]} ${m[2]}` : null),
    };
  }

  // Bare rep count/range with no sets prefix: "10 / side", "6–8 reps", "6 reps".
  m = base.match(/^(\d+)\s*[-–]\s*(\d+)\s*(?:reps?)?$/i);
  if (m?.[1] && m[2]) {
    return {
      target_sets: 1,
      target_reps_min: Number(m[1]),
      target_reps_max: Number(m[2]),
      note: withSideNote(null),
    };
  }
  m = base.match(/^(\d+)\s*reps?$/i) ?? (perSide ? base.match(/^(\d+)$/) : null);
  if (m?.[1]) {
    return {
      target_sets: 1,
      target_reps_min: Number(m[1]),
      target_reps_max: Number(m[1]),
      note: withSideNote(null),
    };
  }

  // Breaths -- counted like reps, but worth keeping the word since "8 reps"
  // and "8 breaths" mean different things to a lifter.
  m = base.match(/^(\d+)\s*[-–]\s*(\d+)\s*breaths?$/i);
  if (m?.[1] && m[2]) {
    return {
      target_sets: 1,
      target_reps_min: Number(m[1]),
      target_reps_max: Number(m[2]),
      note: withSideNote('breaths'),
    };
  }
  m = base.match(/^(\d+)\s*breaths?$/i);
  if (m?.[1]) {
    return {
      target_sets: 1,
      target_reps_min: Number(m[1]),
      target_reps_max: Number(m[1]),
      note: withSideNote('breaths'),
    };
  }

  // Nothing numeric recognized (e.g. "Optional", "Valid choice", "As
  // desired") -- keep the original text as a note rather than inventing
  // a prescription that was never there.
  return { note: withSideNote(dose) };
}

function newTarget(name: string, order: number): PlanExerciseTarget {
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

interface ExtractedRow {
  name: string;
  note: string | null;
  dose: string | null;
}

/** A row is any element with exactly one checkbox descendant -- the
 * structural signature every real source document uses for a loggable
 * item, regardless of what class names or tag names wrap it (see "do not
 * rely exclusively on exact CSS class names," docs/IMPORT_FORMAT.md). */
function extractRow(rowEl: Element): ExtractedRow | null {
  const clone = rowEl.cloneNode(true) as Element;
  clone.querySelectorAll('input').forEach((el) => el.remove());
  // Only leaf spans carry real text -- a wrapper span around
  // name+note's own spans would otherwise contribute its children's
  // concatenated text as a spurious first "segment."
  const segments = Array.from(clone.querySelectorAll('span'))
    .filter((el) => el.children.length === 0)
    .map((el) => el.textContent?.trim() ?? '')
    .filter((t) => t.length > 0);
  // Fall back to the row's own direct text if it has no span children at
  // all (a plain "<li>Name -- 3x10</li>" shape, say).
  const raw = segments.length > 0 ? segments : [(clone.textContent ?? '').trim()];
  if (raw.length === 0 || !raw[0]) return null;

  const doseIndex = raw.findIndex(isDoseLike);
  const name = raw[0];
  if (!name) return null;
  const dose = doseIndex >= 0 ? (raw[doseIndex] ?? null) : null;
  const noteParts = raw.filter((_, i) => i !== 0 && i !== doseIndex);
  return { name, note: noteParts.length > 0 ? noteParts.join(' ') : null, dose };
}

/** Maps each row to the nearest preceding short leaf-text marker in the
 * same container (a "Warm-up"/"Chest and back superset"-style section
 * title) -- a class-agnostic stand-in for `.section-title`/`.label`,
 * found the same way a `.exercise-name` is: by what it structurally *is*
 * (a short leaf run of text that isn't a dose and isn't inside a row),
 * not by what it's called. */
function sectionTitleForRows(container: Element, rows: Element[]): Map<Element, string> {
  const rowSet = new Set(rows);
  let current = '';
  const result = new Map<Element, string>();
  for (const el of Array.from(container.querySelectorAll('*'))) {
    if (rowSet.has(el)) {
      result.set(el, current);
      continue;
    }
    if (el.children.length > 0 || rows.some((r) => r.contains(el))) continue;
    const text = el.textContent?.trim() ?? '';
    if (
      text.length > 0 &&
      text.length < 40 &&
      !isDoseLike(text) &&
      !STATUS_WORDS.has(text.toLowerCase())
    ) {
      current = text;
    }
  }
  return result;
}

/**
 * Parses ATLAS's HTML weekly-guide/quick-workout export shape (checkbox
 * rows grouped under section-title elements, grouped under a titled
 * container) into workouts. Safe by construction: `DOMParser`-created
 * documents are never attached to the live page, so `<script>`/`<style>`
 * content, event handlers, and any embedded JS never execute and nothing
 * is fetched -- see docs/IMPORT_FORMAT.md "HTML import safety."
 */
export function parseHtmlPlan(html: string): ParsedHtmlPlan {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach((el) => el.remove());

  // A "container" is the outermost element that owns at least one checkbox
  // and has its own heading -- a day panel, a tab panel, a standalone
  // routine. Found bottom-up so a nested candidate never wins over its
  // parent.
  const headingSelector = 'h1, h2, h3';
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>('*')).filter(
    (el) => el.querySelector(headingSelector) && el.querySelector('input[type="checkbox"]'),
  );
  // Innermost qualifying elements, not outermost: `<body>`/`<main>` also
  // has *a* heading and *some* checkbox somewhere inside it, but the real
  // per-day/per-routine containers are the specific elements nested
  // inside that actually group one heading with its own checkboxes.
  const containers = candidates.filter(
    (el) => !candidates.some((other) => other !== el && el.contains(other)),
  );

  const unparsedText: string[] = [];
  const workouts: ParsedHtmlWorkout[] = [];

  for (const container of containers) {
    const heading = container.querySelector(headingSelector);
    const label = heading?.textContent?.trim() || 'Imported Workout';
    const status = findStatus(container);

    const exercises: PlanExerciseTarget[] = [];
    const groups: PlanExerciseGroup[] = [];
    const groupKeyBySection = new Map<string, string>();
    let order = 1;
    const checkboxRows = Array.from(container.querySelectorAll('input[type="checkbox"]'))
      .map((cb) => cb.closest('label, li, tr') ?? cb.parentElement)
      .filter((el, index, arr): el is Element => el !== null && arr.indexOf(el) === index);
    const sectionByRow = sectionTitleForRows(container, checkboxRows);

    for (const rowEl of checkboxRows) {
      const extracted = extractRow(rowEl);
      if (!extracted) {
        unparsedText.push(rowEl.textContent?.trim() ?? '');
        continue;
      }
      const { name: resolvedName, note: choiceNote } = resolveChoice(extracted.name);
      const target = newTarget(resolvedName, order);
      order += 1;
      let doseNote: string | null = null;
      if (extracted.dose) {
        const { note, ...numericFields } = parsePrescription(extracted.dose);
        doseNote = note;
        Object.assign(target, numericFields);
      }
      target.notes =
        [extracted.note, choiceNote, doseNote].filter((n): n is string => Boolean(n)).join(' — ') ||
        null;

      // A section explicitly titled as a superset/circuit -- represent it
      // with ATLAS's real grouping mechanism (`ExerciseGroup`) instead of
      // importing its members as unrelated standalone exercises. See
      // "Supersets," docs/IMPORT_FORMAT.md.
      const section = sectionByRow.get(rowEl) ?? '';
      if (/superset|circuit/i.test(section)) {
        let groupKey = groupKeyBySection.get(section);
        let group = groups.find((g) => g.key === groupKey);
        if (!groupKey || !group) {
          groupKey = `${label}::${section}`;
          groupKeyBySection.set(section, groupKey);
          group = {
            key: groupKey,
            type: /circuit/i.test(section) ? 'circuit' : 'superset',
            rounds: 1,
            rest_after_seconds: null,
          };
          groups.push(group);
        }
        target.group_key = groupKey;
        if (target.target_sets && target.target_sets > group.rounds)
          group.rounds = target.target_sets;
      }

      exercises.push(target);
    }

    // A rest day (Sunday) shouldn't accumulate its informational rows
    // ("No structured workout", "Prepare for Monday") as fake exercises,
    // even the ones a dose regex could technically parse a number out of --
    // none of them are actually training. Folded into `unparsedText`
    // instead, which the import preview already surfaces as "parsing
    // assumptions" rather than silently dropping it. See "Sunday must not
    // become a literal exercise," docs/IMPORT_FORMAT.md.
    if (status === 'rest') {
      const summary = exercises.map((e) => e.exercise_name).join('; ');
      workouts.push({
        label,
        status,
        workout: { name: label, is_quick_workout: false, exercises: [] },
      });
      if (summary) unparsedText.push(`${label}: ${summary} (rest day, not imported as exercises)`);
      continue;
    }

    workouts.push({
      label,
      status,
      workout: {
        name: label,
        is_quick_workout: false,
        exercises,
        groups: groups.length > 0 ? groups : undefined,
      },
    });
  }

  return { workouts, unparsedText };
}

const WEEKDAY_RE =
  /\b(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(r(s(day)?)?)?|fri(day)?|sat(urday)?|sun(day)?)\b/i;

export interface HtmlImportOption {
  label: string;
  input: ParsedPlanInput;
}

/**
 * Turns a parsed HTML plan into one or more ready-to-preview import
 * inputs, deciding the one thing `parseHtmlPlan` itself can't know: is
 * this a single multi-day Program (every container names a weekday --
 * the Weekly Workout Guide shape), or several unrelated Quick Workouts
 * that just happen to live in one file (the Mobility & Yoga Guide shape,
 * explicitly required to stay separate rather than being flattened into
 * one workout)? A file with only one container is unambiguous either way.
 */
export function toHtmlImportOptions(parsed: ParsedHtmlPlan, fileTitle: string): HtmlImportOption[] {
  const { workouts } = parsed;
  if (workouts.length === 0) return [];
  if (workouts.length === 1) {
    const only = workouts[0];
    if (!only) return [];
    return [{ label: only.label, input: { kind: 'workout', workout: only.workout } }];
  }

  const weekdayCount = workouts.filter((w) => WEEKDAY_RE.test(w.label)).length;
  const isWeeklyProgram = weekdayCount >= Math.ceil(workouts.length / 2);
  if (isWeeklyProgram) {
    const program: PlanProgram = {
      name: fileTitle,
      description: null,
      weeks: [{ label: null, days: workouts.map((w) => ({ label: w.label, workout: w.workout })) }],
    };
    return [{ label: fileTitle, input: { kind: 'program', program } }];
  }

  return workouts.map((w) => ({ label: w.label, input: { kind: 'workout', workout: w.workout } }));
}

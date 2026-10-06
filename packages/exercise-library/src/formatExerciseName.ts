/**
 * Display-only capitalization for exercise names. The canonical stored
 * `Exercise.name` (and any name derived from it for matching/enrichment/
 * media/aliases) is never touched -- this only formats what's rendered.
 * Numeric tokens ("45", "90") pass through unchanged; a short table covers
 * acronyms that generic title-casing would otherwise mangle ("ez" ->
 * "Ez"). Everything else, single letters included ("t" -> "T" for
 * T-Bar, "l" -> "L" for L-Sit), falls out of plain title-casing.
 *
 * Acceptance pass: a word the owner typed in capitals ("TRX", "DB", "ATG") is
 * an acronym they chose, so it is kept as typed instead of becoming "Trx". The
 * library's own names are all lowercase, so nothing it ships is affected.
 */
const SPECIAL_CASE_WORDS: Record<string, string> = {
  ez: 'EZ',
  rdl: 'RDL',
  amrap: 'AMRAP',
};

const WORD_PATTERN = /[A-Za-z0-9]+(?:'[A-Za-z]+)*/g;

/**
 * Four library names (the "sled 45° ... press" family) came through the source dataset as "45в°": the degree sign's
 * UTF-8 bytes read as Windows-1251. The catalog is corrected at the source and `ensureExercisesSeeded` repairs the
 * stored name on a device that seeded the old one, so nothing stored is garbled any more. This stays as the display
 * and search safety net for the one way the old name can still arrive: restoring an older backup, which brings the
 * stored name back until the next `ensureExercisesSeeded` run repairs it.
 */
export function repairExerciseName(name: string): string {
  return name.replace(/[вВ]°/g, '°');
}

export function formatExerciseName(name: string): string {
  return repairExerciseName(name).replace(WORD_PATTERN, (word) => {
    if (/^\d+$/.test(word)) return word;
    if (/^[A-Z]{2,}$/.test(word)) return word;
    const lower = word.toLowerCase();
    const special = SPECIAL_CASE_WORDS[lower];
    if (special) return special;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}

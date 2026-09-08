/** Case-insensitive, locale-aware A-Z comparator for any named/titled
 * record -- the one shared comparator every browse/discovery list in the
 * app uses (Library, exercise pickers, Quick Workout management), so
 * "alphabetical" means the same thing everywhere rather than each screen
 * rolling its own `.sort()`. Never used inside actual workout execution
 * (Program days, Quick Workout/Gym Mode exercise order), which must stay
 * in its own programmed order -- see docs/DATA_MODEL.md "Alphabetical
 * sorting." */
export function compareByName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

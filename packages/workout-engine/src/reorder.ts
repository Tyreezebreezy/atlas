/** Pure array move, e.g. dragging/bumping an exercise to a new position. */
export function reorder<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
    return items;
  }
  const result = [...items];
  const [moved] = result.splice(fromIndex, 1);
  if (moved === undefined) return items;
  result.splice(toIndex, 0, moved);
  return result;
}

/** Re-stamps `order` to match array position, e.g. after a reorder. */
export function withSequentialOrder<T extends { order: number }>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, order: index }));
}

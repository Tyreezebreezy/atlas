import type { FlattenedProgramDay } from '@atlas/program-engine';

interface SequenceNavigatorProps {
  /** A small window of the flattened sequence around the current position -- see TodayScreen. */
  window: { index: number; day: FlattenedProgramDay }[];
  currentIndex: number;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
}

/** Sequential programs have no calendar week to browse (v0.2.4 Part 19) --
 * this previews neighboring positions in the existing rotation instead of
 * forcing Monday-Sunday onto a mode that doesn't have weekdays at all.
 * Preserves the existing "one current position, advanced only by
 * completing it" model untouched; this is read-only preview navigation. */
export function SequenceNavigator({
  window,
  currentIndex,
  selectedIndex,
  onSelectIndex,
}: SequenceNavigatorProps) {
  return (
    <div className="atlas-week-nav atlas-week-nav--sequence">
      <div className="atlas-week-nav__days">
        {window.map(({ index, day }) => {
          const isCurrent = index === currentIndex;
          const isSelected = index === selectedIndex;
          return (
            <button
              key={day.day.id}
              type="button"
              className={[
                'atlas-week-nav__day',
                'atlas-week-nav__day--sequence',
                isCurrent && 'atlas-week-nav__day--today',
                isSelected && 'atlas-week-nav__day--selected',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={isSelected}
              aria-label={`Day ${index + 1}, ${day.day.label}${isCurrent ? ', current' : ''}`}
              onClick={() => onSelectIndex(index)}
            >
              <span aria-hidden="true" className="atlas-week-nav__daynum">
                {index + 1}
              </span>
              {isCurrent && (
                <span aria-hidden="true" className="atlas-week-nav__today-label">
                  Current
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

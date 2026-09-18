import type { TodayScheduleEntry, WeekDayEntry } from '@atlas/program-engine';

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Date.getDay() order: 0=Sun..6=Sat

type DayStatus =
  'completed' | 'missed' | 'rest' | 'moved' | 'skipped' | 'scheduled' | 'future' | 'none';

/** A day's occurrence-state badge, independent of whether it's also
 * "today" or "selected" -- those are separate visual layers (v0.2.4 Part
 * 4). A `workout` entry is "missed" once its date is in the past,
 * "scheduled" for today, "future" beyond today -- the resolver itself has
 * no opinion on that; only this display layer compares against `todayIso`. */
function statusFor(entry: TodayScheduleEntry, date: string, todayIso: string): DayStatus {
  switch (entry.kind) {
    case 'completed':
      return 'completed';
    case 'skipped':
      return 'skipped';
    case 'moved_away':
      return 'moved';
    case 'rest':
      return 'rest';
    case 'none':
      return 'none';
    case 'workout':
      if (date < todayIso) return 'missed';
      if (date === todayIso) return 'scheduled';
      return 'future';
  }
}

const STATUS_LABEL: Record<DayStatus, string> = {
  completed: 'Completed',
  missed: 'Missed',
  rest: 'Rest',
  moved: 'Moved',
  skipped: 'Skipped',
  scheduled: 'Scheduled',
  future: 'Scheduled',
  none: 'Nothing scheduled',
};

function longWeekday(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
}

function monthDay(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

interface WeekNavigatorProps {
  weekDays: WeekDayEntry[];
  todayIso: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}

/** Compact Monday-first strip standing in for the old full-week card list
 * (v0.2.4) -- one tap previews any day in the primary card below; this
 * component only ever answers "what's scheduled here," never duplicates
 * History. See TodayScreen for what tapping a day actually does. */
export function WeekNavigator({
  weekDays,
  todayIso,
  selectedDate,
  onSelectDate,
  onPrevWeek,
  onNextWeek,
}: WeekNavigatorProps) {
  return (
    <div className="atlas-week-nav">
      <button
        type="button"
        className="atlas-week-nav__arrow"
        onClick={onPrevWeek}
        aria-label="Previous week"
      >
        &lsaquo;
      </button>
      <div className="atlas-week-nav__days">
        {weekDays.map(({ date, weekday, entry }) => {
          const status = statusFor(entry, date, todayIso);
          const isToday = date === todayIso;
          const isSelected = date === selectedDate;
          const label = `${longWeekday(date)}, ${monthDay(date)}${isToday ? ', today' : ''}, ${STATUS_LABEL[status]}`;
          return (
            <button
              key={date}
              type="button"
              className={[
                'atlas-week-nav__day',
                isToday && 'atlas-week-nav__day--today',
                isSelected && 'atlas-week-nav__day--selected',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={isSelected}
              aria-label={label}
              onClick={() => onSelectDate(date)}
            >
              <span aria-hidden="true" className="atlas-week-nav__letter">
                {LETTERS[weekday]}
              </span>
              <span aria-hidden="true" className="atlas-week-nav__daynum">
                {date.slice(-2).replace(/^0/, '')}
              </span>
              <span
                aria-hidden="true"
                className={`atlas-week-nav__dot atlas-week-nav__dot--${status}`}
              />
              {isToday && (
                <span aria-hidden="true" className="atlas-week-nav__today-label">
                  Today
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="atlas-week-nav__arrow"
        onClick={onNextWeek}
        aria-label="Next week"
      >
        &rsaquo;
      </button>
    </div>
  );
}

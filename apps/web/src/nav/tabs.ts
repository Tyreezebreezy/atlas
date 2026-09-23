/** vNext Handoff 03A: 'library' stays a valid screen (reached from More or
 * from Progress's "View Exercises" link) but is no longer one of the
 * permanently-shown bottom-nav buttons -- see PRIMARY_NAV_TABS below. */
export const NAV_TABS = ['today', 'program', 'progress', 'library', 'more'] as const;
export type NavTab = (typeof NAV_TABS)[number];

/** The four buttons actually rendered in the tab bar. */
export const PRIMARY_NAV_TABS = ['today', 'program', 'progress', 'more'] as const satisfies readonly NavTab[];

export const NAV_TAB_LABELS: Record<NavTab, string> = {
  today: 'Today',
  program: 'Program',
  progress: 'Progress',
  library: 'Exercises',
  more: 'More',
};

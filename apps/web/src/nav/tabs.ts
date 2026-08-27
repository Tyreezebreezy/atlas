export const NAV_TABS = ['today', 'program', 'progress', 'library', 'more'] as const;
export type NavTab = (typeof NAV_TABS)[number];

export const NAV_TAB_LABELS: Record<NavTab, string> = {
  today: 'Today',
  program: 'Program',
  progress: 'Progress',
  library: 'Library',
  more: 'More',
};

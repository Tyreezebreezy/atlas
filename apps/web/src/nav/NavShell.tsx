import { lazy, Suspense, useState } from 'react';
import { EmptyScreen } from '../screens/EmptyScreen';
import { NAV_TABS, NAV_TAB_LABELS, type NavTab } from './tabs';

// Lazy: both pull in the exercise library (and its ~1.3MB seed data), so they
// should only load once someone actually opens that tab, not on every boot.
const LibraryScreen = lazy(() =>
  import('../library/LibraryScreen').then((m) => ({ default: m.LibraryScreen })),
);
const ProgramScreen = lazy(() =>
  import('../program/ProgramScreen').then((m) => ({ default: m.ProgramScreen })),
);

// v0.0.1 foundation, v0.0.2 library, v0.0.3 program/workout builder: the rest
// stay placeholders until their own version builds out a real screen.
const PLACEHOLDER_TABS = ['today', 'progress', 'more'] as const;
type PlaceholderTab = (typeof PLACEHOLDER_TABS)[number];

const TAB_DESCRIPTIONS: Record<PlaceholderTab, string> = {
  today: "Today's workout will show up here once a program is active.",
  progress: 'PRs, milestones, and trends will show up here.',
  more: 'History, body data, imports, exports, and settings.',
};

function isPlaceholderTab(tab: NavTab): tab is PlaceholderTab {
  return (PLACEHOLDER_TABS as readonly string[]).includes(tab);
}

export function NavShell() {
  const [activeTab, setActiveTab] = useState<NavTab>('today');

  return (
    <div className="atlas-shell">
      <main className="atlas-shell__content">
        {activeTab === 'library' && (
          <Suspense
            fallback={<EmptyScreen title="Library" description="Loading exercise library…" />}
          >
            <LibraryScreen />
          </Suspense>
        )}
        {activeTab === 'program' && (
          <Suspense fallback={<EmptyScreen title="Program" description="Loading…" />}>
            <ProgramScreen />
          </Suspense>
        )}
        {isPlaceholderTab(activeTab) && (
          <EmptyScreen
            title={NAV_TAB_LABELS[activeTab]}
            description={TAB_DESCRIPTIONS[activeTab]}
          />
        )}
      </main>
      <nav className="atlas-shell__tabbar" aria-label="Primary">
        {NAV_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className="atlas-shell__tab"
            aria-current={activeTab === tab ? 'page' : undefined}
            onClick={() => setActiveTab(tab)}
          >
            {NAV_TAB_LABELS[tab]}
          </button>
        ))}
      </nav>
    </div>
  );
}

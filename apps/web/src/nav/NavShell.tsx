import { lazy, Suspense, useState } from 'react';
import { EmptyScreen } from '../screens/EmptyScreen';
import { NAV_TABS, NAV_TAB_LABELS, type NavTab } from './tabs';

// Lazy: the exercise seed data (~1.3MB) should only load once someone opens
// the Library tab, not on every app boot.
const LibraryScreen = lazy(() =>
  import('../library/LibraryScreen').then((m) => ({ default: m.LibraryScreen })),
);

// v0.0.1 foundation, v0.0.2 library: the rest stay placeholders until v0.0.3
// (workout/program builder) and beyond build out their real screens.
const TAB_DESCRIPTIONS: Record<Exclude<NavTab, 'library'>, string> = {
  today: "Today's workout will show up here once a program is active.",
  program: 'Manage your active program, weeks, and days here.',
  progress: 'PRs, milestones, and trends will show up here.',
  more: 'History, body data, imports, exports, and settings.',
};

export function NavShell() {
  const [activeTab, setActiveTab] = useState<NavTab>('today');

  return (
    <div className="atlas-shell">
      <main className="atlas-shell__content">
        {activeTab === 'library' ? (
          <Suspense
            fallback={<EmptyScreen title="Library" description="Loading exercise library…" />}
          >
            <LibraryScreen />
          </Suspense>
        ) : (
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

import { lazy, Suspense, useState } from 'react';
import { useGymMode } from '../gym/GymModeContext';
import { HistoryScreen } from '../history/HistoryScreen';
import { EmptyScreen } from '../screens/EmptyScreen';
import { SettingsScreen } from '../settings/SettingsScreen';
import { TodayScreen } from '../today/TodayScreen';
import { NAV_TABS, NAV_TAB_LABELS, type NavTab } from './tabs';

// Lazy: both pull in the exercise library (and its ~1.3MB seed data), so they
// should only load once someone actually opens that tab, not on every boot.
const LibraryScreen = lazy(() =>
  import('../library/LibraryScreen').then((m) => ({ default: m.LibraryScreen })),
);
const ProgramScreen = lazy(() =>
  import('../program/ProgramScreen').then((m) => ({ default: m.ProgramScreen })),
);
const GymModeScreen = lazy(() =>
  import('../gym/GymModeScreen').then((m) => ({ default: m.GymModeScreen })),
);

type MoreView = 'menu' | 'history' | 'settings';

function MoreTab() {
  const [view, setView] = useState<MoreView>('menu');
  if (view === 'history') return <HistoryScreen />;
  if (view === 'settings') return <SettingsScreen onBack={() => setView('menu')} />;
  return (
    <div className="atlas-more-menu">
      <h1>More</h1>
      <ul className="atlas-program-screen__list">
        <li>
          <button type="button" onClick={() => setView('history')} aria-label="History">
            <span className="atlas-library__item-name" aria-hidden="true">
              History
            </span>
          </button>
        </li>
        <li>
          <button type="button" onClick={() => setView('settings')} aria-label="Settings">
            <span className="atlas-library__item-name" aria-hidden="true">
              Settings
            </span>
          </button>
        </li>
      </ul>
    </div>
  );
}

// Body/Imports/Exports arrive in later versions and can earn their own tab
// or a spot in this menu then, not before there's real content to show.
const PLACEHOLDER_TABS = ['progress'] as const;
type PlaceholderTab = (typeof PLACEHOLDER_TABS)[number];

const TAB_DESCRIPTIONS: Record<PlaceholderTab, string> = {
  progress: 'PRs, milestones, and trends will show up here.',
};

function isPlaceholderTab(tab: NavTab): tab is PlaceholderTab {
  return (PLACEHOLDER_TABS as readonly string[]).includes(tab);
}

export function NavShell() {
  const [activeTab, setActiveTab] = useState<NavTab>('today');
  const { activeSessionId, exitGymMode } = useGymMode();

  // An active workout takes over the whole app -- no tab bar, no context
  // switching mid-set. Exiting (finish or back) returns to the normal tabs.
  if (activeSessionId) {
    return (
      <div className="atlas-shell">
        <main className="atlas-shell__content">
          <Suspense fallback={<EmptyScreen title="Workout" description="Loading…" />}>
            <GymModeScreen sessionId={activeSessionId} onExit={exitGymMode} />
          </Suspense>
        </main>
      </div>
    );
  }

  return (
    <div className="atlas-shell">
      <main className="atlas-shell__content">
        {activeTab === 'today' && <TodayScreen />}
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
        {activeTab === 'more' && <MoreTab />}
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

import { lazy, Suspense, useState } from 'react';
import { useGymMode } from '../gym/GymModeContext';
import { HistoryScreen } from '../history/HistoryScreen';
import { EmptyScreen } from '../screens/EmptyScreen';
import { SettingsScreen } from '../settings/SettingsScreen';
import { TodayScreen } from '../today/TodayScreen';
import { BodyScreen } from '../body/BodyScreen';
import { NAV_TABS, NAV_TAB_LABELS, type NavTab } from './tabs';

// Lazy: all pull in the exercise library (and its ~1.3MB seed data), so they
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
const ProgressScreen = lazy(() =>
  import('../progress/ProgressScreen').then((m) => ({ default: m.ProgressScreen })),
);
const ImportExportScreen = lazy(() =>
  import('../importexport/ImportExportScreen').then((m) => ({ default: m.ImportExportScreen })),
);

type MoreView = 'menu' | 'history' | 'settings' | 'body' | 'import-export';

function MoreTab() {
  const [view, setView] = useState<MoreView>('menu');
  if (view === 'history') return <HistoryScreen />;
  if (view === 'settings') return <SettingsScreen onBack={() => setView('menu')} />;
  if (view === 'body') return <BodyScreen onBack={() => setView('menu')} />;
  if (view === 'import-export')
    return (
      <Suspense fallback={<EmptyScreen title="Import / Export" description="Loading…" />}>
        <ImportExportScreen onBack={() => setView('menu')} />
      </Suspense>
    );
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
          <button type="button" onClick={() => setView('body')} aria-label="Body">
            <span className="atlas-library__item-name" aria-hidden="true">
              Body
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setView('import-export')}
            aria-label="Import / Export"
          >
            <span className="atlas-library__item-name" aria-hidden="true">
              Import / Export
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
        {activeTab === 'progress' && (
          <Suspense fallback={<EmptyScreen title="Progress" description="Loading…" />}>
            <ProgressScreen onViewExercises={() => setActiveTab('library')} />
          </Suspense>
        )}
        {activeTab === 'more' && <MoreTab />}
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

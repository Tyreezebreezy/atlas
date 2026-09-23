import { lazy, Suspense, useState } from 'react';
import { useGymMode } from '../gym/GymModeContext';
import { LogPastWorkoutScreen } from '../history/LogPastWorkoutScreen';
import { EmptyScreen } from '../screens/EmptyScreen';
import { EquipmentScreen } from '../settings/EquipmentScreen';
import { SettingsScreen } from '../settings/SettingsScreen';
import { TodayScreen } from '../today/TodayScreen';
import {
  HowAtlasWorksScreen,
  OnboardingModal,
  hasCompletedOnboarding,
} from '../onboarding/Onboarding';
import { NAV_TAB_LABELS, PRIMARY_NAV_TABS, type NavTab } from './tabs';

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

type MoreView = 'menu' | 'equipment' | 'log-past' | 'settings' | 'import-export' | 'help';

interface MoreTabProps {
  /** vNext Handoff 03A: Exercise Library moved out of the permanent bottom
   * nav (research pack §4/§17) -- reached from here instead. Delegates to
   * the parent's `activeTab` state rather than owning its own, so
   * `ProgressScreen`'s existing `onViewExercises` callback (which sets
   * `activeTab('library')` directly) keeps working unchanged. */
  onOpenLibrary: () => void;
}

function MoreTab({ onOpenLibrary }: MoreTabProps) {
  const [view, setView] = useState<MoreView>('menu');
  if (view === 'equipment') return <EquipmentScreen onBack={() => setView('menu')} />;
  if (view === 'log-past') return <LogPastWorkoutScreen onBack={() => setView('menu')} />;
  if (view === 'settings') return <SettingsScreen onBack={() => setView('menu')} />;
  if (view === 'help') return <HowAtlasWorksScreen onBack={() => setView('menu')} />;
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
          <button type="button" onClick={onOpenLibrary} aria-label="Exercise Library">
            <span className="atlas-library__item-name" aria-hidden="true">
              Exercise Library
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setView('equipment')}
            aria-label="Equipment / Places"
          >
            <span className="atlas-library__item-name" aria-hidden="true">
              Equipment / Places
            </span>
          </button>
        </li>
        <li>
          <button type="button" onClick={() => setView('log-past')} aria-label="Log Past Workout">
            <span className="atlas-library__item-name" aria-hidden="true">
              Log Past Workout
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
        <li>
          <button type="button" onClick={() => setView('help')} aria-label="How ATLAS Works">
            <span className="atlas-library__item-name" aria-hidden="true">
              How ATLAS Works
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
  const [showOnboarding, setShowOnboarding] = useState(() => !hasCompletedOnboarding());

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
            fallback={<EmptyScreen title="Exercises" description="Loading exercise library…" />}
          >
            <LibraryScreen onBack={() => setActiveTab('more')} />
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
        {activeTab === 'more' && <MoreTab onOpenLibrary={() => setActiveTab('library')} />}
      </main>
      <nav className="atlas-shell__tabbar" aria-label="Primary">
        {PRIMARY_NAV_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className="atlas-shell__tab"
            // 'library' has no button of its own -- it's reached via More,
            // so More reads as the active destination while viewing it.
            aria-current={
              activeTab === tab || (tab === 'more' && activeTab === 'library') ? 'page' : undefined
            }
            onClick={() => setActiveTab(tab)}
          >
            {NAV_TAB_LABELS[tab]}
          </button>
        ))}
      </nav>
      {showOnboarding && <OnboardingModal onDone={() => setShowOnboarding(false)} />}
    </div>
  );
}

import { useState } from 'react';
import { EmptyScreen } from '../screens/EmptyScreen';
import { NAV_TABS, NAV_TAB_LABELS, type NavTab } from './tabs';

// v0.0.1 foundation: real navigation shell, placeholder screen content.
// Screens get built out starting v0.0.3 (workout/program builder).
const TAB_DESCRIPTIONS: Record<NavTab, string> = {
  today: "Today's workout will show up here once a program is active.",
  program: 'Manage your active program, weeks, and days here.',
  progress: 'PRs, milestones, and trends will show up here.',
  library: 'Search and browse the exercise library here.',
  more: 'History, body data, imports, exports, and settings.',
};

export function NavShell() {
  const [activeTab, setActiveTab] = useState<NavTab>('today');

  return (
    <div className="atlas-shell">
      <main className="atlas-shell__content">
        <EmptyScreen title={NAV_TAB_LABELS[activeTab]} description={TAB_DESCRIPTIONS[activeTab]} />
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

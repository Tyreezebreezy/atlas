import { useState } from 'react';

/**
 * v0.2.5. First-run orientation + the permanent "How ATLAS Works" help.
 * The onboarding is a short, dismissible 5-card walkthrough gated by a
 * durable localStorage once-flag (device-local, same mechanism as Settings);
 * "How ATLAS Works" is the same content, always reopenable from More.
 */

const ONBOARDING_DONE_KEY = 'atlas-onboarding-done';
const GYM_HINT_DONE_KEY = 'atlas-gym-hint-done';

export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DONE_KEY) === '1';
  } catch {
    return true; // private-mode/quota: don't nag
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(ONBOARDING_DONE_KEY, '1');
  } catch {
    // same tolerance as settings.ts
  }
}

export function hasSeenGymHint(): boolean {
  try {
    return localStorage.getItem(GYM_HINT_DONE_KEY) === '1';
  } catch {
    return true;
  }
}

export function markGymHintSeen(): void {
  try {
    localStorage.setItem(GYM_HINT_DONE_KEY, '1');
  } catch {
    // ignore
  }
}

interface Card {
  title: string;
  body: string;
}

const ONBOARDING_CARDS: Card[] = [
  { title: 'Today', body: "Start today's scheduled workout and see missed or upcoming training." },
  {
    title: 'Program',
    body: 'Manage your weekly plan and the supporting routines you run anytime.',
  },
  { title: 'Progress', body: 'See personal records, milestones, and training analytics.' },
  { title: 'Library', body: 'Browse exercises, demonstrations, and body-part filters.' },
  { title: 'More', body: 'History, Body, Import/Export, Settings, and this help.' },
];

export function OnboardingModal({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const card = ONBOARDING_CARDS[index];

  function finish() {
    markOnboardingComplete();
    onDone();
  }

  return (
    <div className="atlas-onboarding" role="dialog" aria-label="Welcome to ATLAS">
      <div className="atlas-onboarding__panel">
        <p className="atlas-onboarding__eyebrow">Welcome to ATLAS</p>
        <h2 className="atlas-onboarding__title">{card?.title}</h2>
        <p className="atlas-onboarding__body">{card?.body}</p>
        <div className="atlas-onboarding__dots" aria-hidden="true">
          {ONBOARDING_CARDS.map((_, i) => (
            <span key={i} className={i === index ? 'atlas-onboarding__dot--active' : undefined} />
          ))}
        </div>
        <div className="atlas-onboarding__actions">
          <button type="button" onClick={finish}>
            Skip
          </button>
          {index < ONBOARDING_CARDS.length - 1 ? (
            <button
              type="button"
              className="atlas-onboarding__next"
              onClick={() => setIndex((i) => i + 1)}
            >
              Next
            </button>
          ) : (
            <button type="button" className="atlas-onboarding__next" onClick={finish}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface HelpSection {
  title: string;
  body: string;
}

const HELP_SECTIONS: HelpSection[] = [
  {
    title: 'Today',
    body: "Shows the one workout scheduled for today. Missed workouts appear in a compact reminder list — Dismiss just removes them from Today without changing what's scheduled. Up Next previews the next training day.",
  },
  {
    title: 'Program',
    body: 'Your weekly plan (Monday–Sunday) plus supporting routines you can start anytime. Edit sets, reps, rest, progression, and exercise order here.',
  },
  {
    title: 'Gym Mode',
    body: 'The workout execution screen. Log each set, see your Last / Best / Target at a glance, and finish when done. An active workout takes over the whole app.',
  },
  {
    title: 'Work vs Rest timers',
    body: 'A Work Timer measures the exercise itself (a plank hold, a dead hang). A Rest Timer measures recovery after a set. They are independent — some exercises have a work timer, some turn the rest timer off.',
  },
  {
    title: 'Set types',
    body: 'Each set can be Working, Warm-up, AMRAP, Drop, Failure, or Rest-Pause. Warm-up sets are excluded from PRs and training volume.',
  },
  {
    title: 'Last / Best / Target / Today',
    body: 'Last is your most recent completed performance of this exercise; Best is your headline personal record; Target is today’s prescribed load and range. Today’s entries are what you log now.',
  },
  {
    title: 'Optional, OR, and paired exercises',
    body: 'Optional exercises never block completion. An OR slot (“Assisted Pull-Up OR Lat Pulldown”) is satisfied by completing one of its choices. Paired blocks (A1/A2) are run as a superset, back and forth.',
  },
  {
    title: 'Progress & History',
    body: 'Progress shows PRs, milestones, and how your training is distributed by muscle group and movement. History lists every completed session; “Log Past Workout” back-fills one you forgot to log.',
  },
];

export function HowAtlasWorksScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="atlas-help">
      <h1>How ATLAS Works</h1>
      {HELP_SECTIONS.map((section) => (
        <section key={section.title} className="atlas-help__section">
          <h2>{section.title}</h2>
          <p>{section.body}</p>
        </section>
      ))}
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Back
      </button>
    </div>
  );
}

/** One-time Gym Mode discoverability hint (v0.2.5), dismissible and never
 * shown again once dismissed. */
export function GymModeHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="atlas-gym-hint" role="note" aria-label="Workout controls">
      <p className="atlas-gym-hint__title">Workout controls</p>
      <ul>
        <li>Timed exercises have a Work timer.</li>
        <li>The Rest timer controls recovery between sets.</li>
        <li>Tap timer values to adjust them.</li>
        <li>LAST shows your previous performance.</li>
        <li>Use … for history, substitutions and more.</li>
      </ul>
      <button type="button" onClick={onDismiss}>
        Got it
      </button>
    </div>
  );
}

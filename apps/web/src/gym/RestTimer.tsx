import { useEffect, useState } from 'react';
import { remainingSeconds } from '@atlas/workout-engine';
import type { TimerState } from '@atlas/data-model';

interface RestTimerProps {
  timer: TimerState;
  onAdjust: (deltaSeconds: number) => void;
  onSkip: () => void;
  onComplete: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Timestamp-derived every tick, never a decrementing counter -- resilient to the tab being backgrounded mid-rest. */
export function RestTimer({ timer, onAdjust, onSkip, onComplete }: RestTimerProps) {
  const [remaining, setRemaining] = useState(() => remainingSeconds(timer));

  useEffect(() => {
    let completed = false;
    const tick = () => {
      const value = remainingSeconds(timer);
      setRemaining(value);
      if (value <= 0 && !completed) {
        completed = true;
        onComplete();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timer, onComplete]);

  return (
    <div className="atlas-rest-timer" role="timer" aria-live="polite">
      <span className="atlas-rest-timer__label">Rest</span>
      <span className="atlas-rest-timer__time">{formatTime(remaining)}</span>
      <div className="atlas-rest-timer__actions">
        <button
          type="button"
          onClick={() => onAdjust(-15)}
          aria-label="Subtract 15 seconds from rest"
        >
          &minus;15
        </button>
        <button type="button" onClick={() => onAdjust(15)} aria-label="Add 15 seconds to rest">
          +15
        </button>
        <button type="button" onClick={onSkip}>
          Skip Rest
        </button>
      </div>
    </div>
  );
}

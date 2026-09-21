import { useState } from 'react';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';

interface SettingsScreenProps {
  onBack: () => void;
}

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const [settings, setSettings] = useState(loadSettings);

  function update(patch: Partial<typeof settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  }

  return (
    <div className="atlas-settings">
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Back
      </button>
      <h1>Settings</h1>

      <div className="atlas-settings__row">
        <label htmlFor="pre-countdown-enabled">Pre-exercise countdown</label>
        <input
          id="pre-countdown-enabled"
          type="checkbox"
          checked={settings.preCountdownEnabled}
          onChange={(e) => update({ preCountdownEnabled: e.target.checked })}
        />
      </div>
      <p className="atlas-settings__hint">
        A short countdown before a timed exercise starts, so there's time to get into position.
      </p>

      {settings.preCountdownEnabled && (
        <div className="atlas-settings__row">
          <label htmlFor="pre-countdown-seconds">Countdown length (seconds)</label>
          <input
            id="pre-countdown-seconds"
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            value={settings.preCountdownSeconds}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              update({
                preCountdownSeconds: Number.isFinite(parsed)
                  ? Math.min(10, Math.max(1, parsed))
                  : DEFAULT_SETTINGS.preCountdownSeconds,
              });
            }}
            onFocus={(e) => e.target.select()}
          />
        </div>
      )}

      <h2>Timer signals</h2>
      <div className="atlas-settings__row">
        <label htmlFor="timer-sound-enabled">Sound</label>
        <input
          id="timer-sound-enabled"
          type="checkbox"
          checked={settings.timerSoundEnabled}
          onChange={(e) => update({ timerSoundEnabled: e.target.checked })}
        />
      </div>
      <div className="atlas-settings__row">
        <label htmlFor="timer-vibration-enabled">Vibration</label>
        <input
          id="timer-vibration-enabled"
          type="checkbox"
          checked={settings.timerVibrationEnabled}
          onChange={(e) => update({ timerVibrationEnabled: e.target.checked })}
        />
      </div>
      <div className="atlas-settings__row">
        <label htmlFor="timer-flash-enabled">Visual flash</label>
        <input
          id="timer-flash-enabled"
          type="checkbox"
          checked={settings.timerFlashEnabled}
          onChange={(e) => update({ timerFlashEnabled: e.target.checked })}
        />
      </div>
      <p className="atlas-settings__hint">
        Not every device supports every signal (e.g. most desktop browsers can't vibrate) --
        unsupported ones simply do nothing rather than erroring.
      </p>
    </div>
  );
}

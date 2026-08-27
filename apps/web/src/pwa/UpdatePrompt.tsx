import { useRegisterSW } from 'virtual:pwa-register/react';

// Never force-reload mid-workout (handoff sec. 33) — vite.config.ts uses
// registerType: 'prompt', so this only appears when the user opts in.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="atlas-update-prompt" role="status">
      <p>ATLAS update available.</p>
      <div className="atlas-update-prompt__actions">
        <button type="button" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
        <button type="button" onClick={() => updateServiceWorker(true)}>
          Update
        </button>
      </div>
    </div>
  );
}

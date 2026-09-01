import { useRegisterSW } from 'virtual:pwa-register/react';
import { useGymMode } from '../gym/GymModeContext';

// Never force-reload mid-workout (handoff sec. 33) — vite.config.ts uses
// registerType: 'prompt', so a reload only ever happens on explicit user
// click. That alone isn't quite "defer until safe" though: a user mid-set
// could still tap Update without realizing it. While Gym Mode is active,
// the prompt is suppressed entirely rather than just reachable -- it
// reappears the moment the user exits Gym Mode, still gated behind their
// own click (v0.1.0 sec. 3.4).
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const { activeSessionId } = useGymMode();

  if (!needRefresh || activeSessionId) return null;

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

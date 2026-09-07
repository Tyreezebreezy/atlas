import type { AtlasSettings } from '../settings/settings';

/**
 * Best-effort timer-completion signal -- sound (a short generated beep, no
 * audio asset needed), vibration, and a caller-applied visual flash class,
 * each independently gated by settings and each wrapped so an unsupported
 * or denied API degrades silently rather than breaking Gym Mode. Not every
 * platform supports every signal (desktop browsers largely lack
 * `navigator.vibrate`, autoplay policies can block audio before any user
 * gesture) -- failing to fire one is never an error, just one fewer cue.
 */
export function fireTimerCompletionSignal(
  settings: Pick<AtlasSettings, 'timerSoundEnabled' | 'timerVibrationEnabled'>,
): void {
  if (settings.timerVibrationEnabled) {
    try {
      navigator.vibrate?.(200);
    } catch {
      // unsupported -- no-op
    }
  }

  if (settings.timerSoundEnabled) {
    try {
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.3);
      oscillator.onended = () => void ctx.close();
    } catch {
      // unsupported/blocked (autoplay policy) -- no-op
    }
  }
}

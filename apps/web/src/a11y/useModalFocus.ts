import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Which element Tab / Shift+Tab should move to so focus never leaves a modal dialog, or null to let the browser move
 * it normally. Focus that is already outside the dialog (behind the overlay) is pulled back in.
 */
export function trapTarget<T>(items: T[], active: T | null, shiftKey: boolean): T | null {
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) return null;
  if (active === null || !items.includes(active)) return shiftKey ? last : first;
  if (shiftKey && active === first) return last;
  if (!shiftKey && active === last) return first;
  return null;
}

/**
 * Acceptance pass. An overlay that covers the screen has to behave like the dialog it looks like: focus moves into it
 * when it opens, Tab stays inside it (the page behind is out of reach), Escape closes it, and focus goes back to
 * whatever opened it. The Gym Mode options sheet and the welcome overlay did none of this -- a keyboard user could not
 * dismiss them and tabbed away into controls hidden behind the overlay. The container needs `tabIndex={-1}`.
 */
export function useModalFocus(
  container: RefObject<HTMLElement | null>,
  onEscape?: () => void,
): void {
  const escape = useRef(onEscape);
  escape.current = onEscape;

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () =>
      [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0,
      );
    (focusables()[0] ?? root).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && escape.current) {
        event.preventDefault();
        event.stopPropagation();
        escape.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const target = trapTarget(items, active, event.shiftKey);
      if (target) {
        event.preventDefault();
        target.focus();
      } else if (items.length === 0) {
        event.preventDefault();
      }
    }
    // On the document in the capture phase, so focus that has slipped out behind the overlay is caught as well.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      opener?.focus();
    };
  }, [container]);
}

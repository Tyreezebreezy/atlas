import { useEffect, useRef, type KeyboardEvent } from 'react';

interface ProgressNavProps<K extends string> {
  items: { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
  /** Prefix for the tab/panel ids so the panel can name its tab. */
  idPrefix: string;
  label: string;
}

export const tabId = (prefix: string, key: string) => `${prefix}-tab-${key}`;
export const panelId = (prefix: string, key: string) => `${prefix}-panel-${key}`;

/**
 * vNext Handoff 03B. Progress's section switcher: a horizontally scrollable
 * pill row, so six sections never squeeze into unreadably narrow fixed tabs
 * on a phone. Standard tabs semantics -- one tab stop for the whole row
 * (roving tabindex), arrow keys / Home / End move between sections -- and the
 * active tab scrolls into view when it changes (e.g. a link from Overview).
 */
export function ProgressNav<K extends string>({
  items,
  active,
  onChange,
  idPrefix,
  label,
}: ProgressNavProps<K>) {
  const buttons = useRef(new Map<K, HTMLButtonElement>());

  useEffect(() => {
    buttons.current.get(active)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = items.findIndex((item) => item.key === active);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    const target = items[next];
    if (!target) return;
    onChange(target.key);
    buttons.current.get(target.key)?.focus();
  }

  return (
    <div className="atlas-progress__segments" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.key}
          ref={(node) => {
            if (node) buttons.current.set(item.key, node);
            else buttons.current.delete(item.key);
          }}
          type="button"
          role="tab"
          id={tabId(idPrefix, item.key)}
          aria-selected={active === item.key}
          aria-controls={panelId(idPrefix, item.key)}
          tabIndex={active === item.key ? 0 : -1}
          className={
            active === item.key
              ? 'atlas-progress__segment atlas-progress__segment--active'
              : 'atlas-progress__segment'
          }
          onClick={() => onChange(item.key)}
          onKeyDown={handleKeyDown}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

import type { ChangeEvent } from 'react';

interface FilePickerProps {
  /** What the button says, and what a screen reader announces for the file control. */
  label: string;
  accept: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * A file chooser that looks like the rest of ATLAS. The browser's own "Choose
 * File / No file chosen" control is a grey default button that matches nothing
 * else here; this puts a secondary button in its place. The real input stays in
 * the page, visually hidden, so it is still the control a keyboard or screen
 * reader reaches; the label is its visible face.
 */
export function FilePicker({ label, accept, onChange }: FilePickerProps) {
  return (
    <label className="atlas-btn atlas-btn--secondary atlas-file-picker">
      {label}
      <input type="file" accept={accept} onChange={onChange} className="atlas-sr-only" />
    </label>
  );
}

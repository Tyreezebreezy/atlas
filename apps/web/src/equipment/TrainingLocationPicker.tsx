import { activeLocations } from '@atlas/equipment-engine';
import type { TrainingLocation } from '@atlas/data-model';

interface TrainingLocationPickerProps {
  locations: TrainingLocation[];
  /** The chosen `TrainingLocation.id`, or null for "no location". */
  value: string | null;
  onChange: (locationId: string | null) => void;
  label?: string;
}

/**
 * vNext Handoff 04B. The small "where am I training" control on Today and in a
 * workout: a native select, so it is keyboard- and screen-reader-friendly with
 * no custom widget, and a tap on a phone opens the system picker rather than a
 * full-screen chooser. "No location" is always an option -- a workout never
 * needs a place.
 *
 * Only places that can be chosen are listed, plus -- so the control never
 * misreports what it holds -- the current value if it has since been archived.
 */
export function TrainingLocationPicker({
  locations,
  value,
  onChange,
  label = 'Training at',
}: TrainingLocationPickerProps) {
  const choices = activeLocations(locations);
  const current = value ? locations.find((l) => l.id === value) : undefined;
  const archivedCurrent =
    current && !choices.some((l) => l.id === current.id) ? current : undefined;

  return (
    <label className="atlas-location-picker">
      <span className="atlas-location-picker__label">{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">No location</option>
        {choices.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
            {location.is_default ? ' (default)' : ''}
          </option>
        ))}
        {archivedCurrent && (
          <option value={archivedCurrent.id}>{archivedCurrent.name} (archived)</option>
        )}
      </select>
    </label>
  );
}

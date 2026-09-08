import { NO_PROGRESSION } from '@atlas/data-model';
import type { ProgressionPolicy, ProgressionPolicyKind } from '@atlas/data-model';

interface ProgressionPolicyFieldsProps {
  idPrefix: string;
  policy: ProgressionPolicy | null | undefined;
  onChange: (policy: ProgressionPolicy | null) => void;
}

const KIND_LABELS: Record<ProgressionPolicyKind, string> = {
  none: 'None',
  double_progression: 'Double Progression',
  linear_load: 'Linear Load',
  timed: 'Timed',
};

/** Shared kind + increment/ceiling fields, used both at Program-default
 * level (`ProgramEditor.tsx`) and per-exercise override level
 * (`TemplateEditor.tsx`) -- see docs/PROGRESSION.md. `null` (not
 * `NO_PROGRESSION`) means "no opinion, fall through to the next tier";
 * selecting "None" explicitly here still writes the resolved `none`
 * policy object rather than clearing the field back to null, matching
 * what a deliberate choice should do vs. simply never having set one. */
export function ProgressionPolicyFields({
  idPrefix,
  policy,
  onChange,
}: ProgressionPolicyFieldsProps) {
  const kind = policy?.kind ?? 'none';

  function updateKind(nextKind: ProgressionPolicyKind) {
    if (nextKind === 'none') {
      onChange(NO_PROGRESSION);
      return;
    }
    onChange({
      kind: nextKind,
      load_increment: policy?.load_increment ?? 5,
      duration_increment_seconds: policy?.duration_increment_seconds ?? 5,
      duration_ceiling_seconds: policy?.duration_ceiling_seconds ?? null,
    });
  }

  return (
    <div className="atlas-settings__row">
      <label htmlFor={`${idPrefix}-kind`}>Progression</label>
      <select
        id={`${idPrefix}-kind`}
        value={kind}
        onChange={(e) => updateKind(e.target.value as ProgressionPolicyKind)}
      >
        {Object.entries(KIND_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {(kind === 'double_progression' || kind === 'linear_load') && (
        <input
          type="number"
          inputMode="decimal"
          aria-label="Load increment"
          placeholder="Load increment"
          value={policy?.load_increment ?? ''}
          onChange={(e) =>
            onChange({
              kind,
              load_increment: e.target.value === '' ? null : Number(e.target.value),
              duration_increment_seconds: policy?.duration_increment_seconds ?? null,
              duration_ceiling_seconds: policy?.duration_ceiling_seconds ?? null,
            })
          }
        />
      )}
      {kind === 'timed' && (
        <>
          <input
            type="number"
            inputMode="numeric"
            aria-label="Duration increment (seconds)"
            placeholder="+seconds"
            value={policy?.duration_increment_seconds ?? ''}
            onChange={(e) =>
              onChange({
                kind,
                load_increment: null,
                duration_increment_seconds: e.target.value === '' ? null : Number(e.target.value),
                duration_ceiling_seconds: policy?.duration_ceiling_seconds ?? null,
              })
            }
          />
          <input
            type="number"
            inputMode="numeric"
            aria-label="Duration ceiling (seconds)"
            placeholder="Ceiling seconds"
            value={policy?.duration_ceiling_seconds ?? ''}
            onChange={(e) =>
              onChange({
                kind,
                load_increment: null,
                duration_increment_seconds: policy?.duration_increment_seconds ?? null,
                duration_ceiling_seconds: e.target.value === '' ? null : Number(e.target.value),
              })
            }
          />
        </>
      )}
    </div>
  );
}

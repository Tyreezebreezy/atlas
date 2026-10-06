interface NumberFieldProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
}

export function NumberField({ label, value, onChange, min, max }: NumberFieldProps) {
  return (
    <label className="atlas-number-field">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value ?? ''}
        onChange={(e) => {
          if (e.target.value === '') return onChange(null);
          const typed = Number(e.target.value);
          if (!Number.isFinite(typed)) return onChange(null);
          // `min`/`max` on a number input are only hints -- typing "-4" sails past them -- so the value is held to them
          // here. A negative set count or load is never what anyone meant, and it used to be saved.
          onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, typed)));
        }}
      />
    </label>
  );
}

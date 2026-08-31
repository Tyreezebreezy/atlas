import { useState, type FormEvent } from 'react';
import { createBodyMeasurement } from '@atlas/body-composition';
import type { BodyMeasurement } from '@atlas/data-model';

interface BodyMeasurementFormProps {
  /** When set, the form edits this measurement in place instead of creating a new one. */
  existing?: BodyMeasurement | null;
  onSaved: (measurement: BodyMeasurement) => void;
  onCancel: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseNum(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function numToStr(n: number | null): string {
  return n != null ? String(n) : '';
}

export function BodyMeasurementForm({ existing, onSaved, onCancel }: BodyMeasurementFormProps) {
  const [date, setDate] = useState(existing?.date ?? today());
  const [weight, setWeight] = useState(numToStr(existing?.weight ?? null));
  const [bodyFatPercentage, setBodyFatPercentage] = useState(
    numToStr(existing?.body_fat_percentage ?? null),
  );
  const [muscleMass, setMuscleMass] = useState(numToStr(existing?.muscle_mass ?? null));
  const [waterPercentage, setWaterPercentage] = useState(
    numToStr(existing?.water_percentage ?? null),
  );
  const [fatMass, setFatMass] = useState(numToStr(existing?.fat_mass ?? null));
  const [leanMass, setLeanMass] = useState(numToStr(existing?.lean_mass ?? null));
  const [visceralFat, setVisceralFat] = useState(numToStr(existing?.visceral_fat ?? null));
  const [boneMass, setBoneMass] = useState(numToStr(existing?.bone_mass ?? null));
  const [bmr, setBmr] = useState(numToStr(existing?.bmr ?? null));
  const [notes, setNotes] = useState(existing?.notes ?? '');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!date) return;

    const fields = {
      date,
      weight: parseNum(weight),
      body_fat_percentage: parseNum(bodyFatPercentage),
      muscle_mass: parseNum(muscleMass),
      water_percentage: parseNum(waterPercentage),
      fat_mass: parseNum(fatMass),
      lean_mass: parseNum(leanMass),
      visceral_fat: parseNum(visceralFat),
      bone_mass: parseNum(boneMass),
      bmr: parseNum(bmr),
      notes: notes.trim() || null,
    };

    if (existing) {
      onSaved({
        ...existing,
        ...fields,
        updated_at: new Date().toISOString(),
        version: existing.version + 1,
      });
      return;
    }

    onSaved(
      createBodyMeasurement({
        date: fields.date,
        weight: fields.weight,
        bodyFatPercentage: fields.body_fat_percentage,
        muscleMass: fields.muscle_mass,
        waterPercentage: fields.water_percentage,
        fatMass: fields.fat_mass,
        leanMass: fields.lean_mass,
        visceralFat: fields.visceral_fat,
        boneMass: fields.bone_mass,
        bmr: fields.bmr,
        notes: fields.notes,
      }),
    );
  }

  return (
    <form className="atlas-body-form" onSubmit={handleSubmit}>
      <h1>{existing ? 'Edit Measurement' : 'Log Measurement'}</h1>

      <label htmlFor="bm-date">Date</label>
      <input
        id="bm-date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
      />

      <label htmlFor="bm-weight">Weight (lb)</label>
      <input
        id="bm-weight"
        type="number"
        step="0.1"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
      />

      <label htmlFor="bm-bodyfat">Body fat (%)</label>
      <input
        id="bm-bodyfat"
        type="number"
        step="0.1"
        value={bodyFatPercentage}
        onChange={(e) => setBodyFatPercentage(e.target.value)}
      />

      <label htmlFor="bm-muscle">Muscle mass (lb)</label>
      <input
        id="bm-muscle"
        type="number"
        step="0.1"
        value={muscleMass}
        onChange={(e) => setMuscleMass(e.target.value)}
      />

      <label htmlFor="bm-water">Water (%)</label>
      <input
        id="bm-water"
        type="number"
        step="0.1"
        value={waterPercentage}
        onChange={(e) => setWaterPercentage(e.target.value)}
      />

      <label htmlFor="bm-fatmass">Fat mass (lb)</label>
      <input
        id="bm-fatmass"
        type="number"
        step="0.1"
        value={fatMass}
        onChange={(e) => setFatMass(e.target.value)}
      />

      <label htmlFor="bm-leanmass">Lean mass (lb)</label>
      <input
        id="bm-leanmass"
        type="number"
        step="0.1"
        value={leanMass}
        onChange={(e) => setLeanMass(e.target.value)}
      />

      <label htmlFor="bm-visceral">Visceral fat</label>
      <input
        id="bm-visceral"
        type="number"
        step="0.1"
        value={visceralFat}
        onChange={(e) => setVisceralFat(e.target.value)}
      />

      <label htmlFor="bm-bone">Bone mass (lb)</label>
      <input
        id="bm-bone"
        type="number"
        step="0.1"
        value={boneMass}
        onChange={(e) => setBoneMass(e.target.value)}
      />

      <label htmlFor="bm-bmr">BMR (calories)</label>
      <input id="bm-bmr" type="number" value={bmr} onChange={(e) => setBmr(e.target.value)} />

      <label htmlFor="bm-notes">Notes</label>
      <textarea
        id="bm-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. Fasted, morning"
      />

      <div className="atlas-body-form__actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}

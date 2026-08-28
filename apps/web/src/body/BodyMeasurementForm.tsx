import { useState, type FormEvent } from 'react';
import { createBodyMeasurement } from '@atlas/body-composition';
import type { BodyMeasurement } from '@atlas/data-model';

interface BodyMeasurementFormProps {
  onCreated: (measurement: BodyMeasurement) => void;
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

export function BodyMeasurementForm({ onCreated, onCancel }: BodyMeasurementFormProps) {
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState('');
  const [bodyFatPercentage, setBodyFatPercentage] = useState('');
  const [muscleMass, setMuscleMass] = useState('');
  const [waterPercentage, setWaterPercentage] = useState('');
  const [fatMass, setFatMass] = useState('');
  const [leanMass, setLeanMass] = useState('');
  const [visceralFat, setVisceralFat] = useState('');
  const [boneMass, setBoneMass] = useState('');
  const [bmr, setBmr] = useState('');
  const [notes, setNotes] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!date) return;
    onCreated(
      createBodyMeasurement({
        date,
        weight: parseNum(weight),
        bodyFatPercentage: parseNum(bodyFatPercentage),
        muscleMass: parseNum(muscleMass),
        waterPercentage: parseNum(waterPercentage),
        fatMass: parseNum(fatMass),
        leanMass: parseNum(leanMass),
        visceralFat: parseNum(visceralFat),
        boneMass: parseNum(boneMass),
        bmr: parseNum(bmr),
        notes: notes.trim() || null,
      }),
    );
  }

  return (
    <form className="atlas-body-form" onSubmit={handleSubmit}>
      <h1>Log Measurement</h1>

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

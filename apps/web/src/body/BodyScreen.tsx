import { useEffect, useMemo, useState } from 'react';
import { weightSeries, bodyFatSeries } from '@atlas/body-composition';
import type { BodyMeasurement } from '@atlas/data-model';
import { useStorage } from '../storage/StorageContext';
import { TrendChart } from '../progress/TrendChart';
import { BodyMeasurementForm } from './BodyMeasurementForm';

function formatDate(dateStr: string): string {
  // Plain YYYY-MM-DD -- parse as local, not UTC-shifted, so the date shown always matches what was entered.
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const METRIC_LABELS: { key: keyof BodyMeasurement; label: string; unit: string }[] = [
  { key: 'muscle_mass', label: 'Muscle', unit: 'lb' },
  { key: 'water_percentage', label: 'Water', unit: '%' },
  { key: 'fat_mass', label: 'Fat mass', unit: 'lb' },
  { key: 'lean_mass', label: 'Lean mass', unit: 'lb' },
  { key: 'visceral_fat', label: 'Visceral fat', unit: '' },
  { key: 'bone_mass', label: 'Bone mass', unit: 'lb' },
  { key: 'bmr', label: 'BMR', unit: 'cal' },
];

interface BodyScreenProps {
  onBack: () => void;
}

export function BodyScreen({ onBack }: BodyScreenProps) {
  const storage = useStorage();
  const [loading, setLoading] = useState(true);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!storage) return;
    void (async () => {
      setMeasurements(await storage.bodyMeasurements.getAll());
      setLoading(false);
    })();
  }, [storage]);

  const history = useMemo(
    () => [...measurements].sort((a, b) => b.date.localeCompare(a.date)),
    [measurements],
  );
  const weightPoints = useMemo(() => weightSeries(measurements), [measurements]);
  const bodyFatPoints = useMemo(() => bodyFatSeries(measurements), [measurements]);
  const editingMeasurement = editingId
    ? (measurements.find((m) => m.id === editingId) ?? null)
    : null;

  async function handleSaved(measurement: BodyMeasurement) {
    if (!storage) return;
    await storage.bodyMeasurements.put(measurement);
    setMeasurements(await storage.bodyMeasurements.getAll());
    setShowForm(false);
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (!storage) return;
    // Deleting or editing a measurement never touches Milestone rows --
    // an already-achieved bodyweight_multiplier milestone's frozen
    // target_weight/achieved_at are untouched by construction (evaluation
    // skips any milestone with achieved_at set, regardless of what the
    // BodyMeasurement history now says). See docs/BODY_COMPOSITION.md.
    await storage.bodyMeasurements.softDelete(id);
    setMeasurements(await storage.bodyMeasurements.getAll());
    setConfirmDeleteId(null);
  }

  if (!storage || loading) {
    return (
      <div className="atlas-empty-screen">
        <h1>Body</h1>
        <p>Loading&hellip;</p>
      </div>
    );
  }

  if (showForm || editingMeasurement) {
    return (
      <BodyMeasurementForm
        existing={editingMeasurement}
        onSaved={(m) => void handleSaved(m)}
        onCancel={() => {
          setShowForm(false);
          setEditingId(null);
        }}
      />
    );
  }

  return (
    <div className="atlas-body">
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Back
      </button>
      <h1>Body</h1>

      {measurements.length === 0 ? (
        <p className="atlas-program-screen__empty">No measurements logged yet.</p>
      ) : (
        <>
          <section>
            <h2>Weight</h2>
            <TrendChart points={weightPoints} unit=" lb" />
          </section>
          <section>
            <h2>Body Fat</h2>
            <TrendChart points={bodyFatPoints} unit="%" />
          </section>
        </>
      )}

      <section>
        <h2>History</h2>
        {history.length === 0 ? (
          <p className="atlas-program-screen__empty">
            Log your first measurement to start tracking.
          </p>
        ) : (
          <ul className="atlas-body__history-list">
            {history.map((m) => {
              const extras = METRIC_LABELS.filter((metric) => m[metric.key] != null);
              return (
                <li key={m.id}>
                  <div className="atlas-body__history-primary">
                    <span className="atlas-body__history-date">{formatDate(m.date)}</span>
                    <span className="atlas-body__history-values">
                      {m.weight != null && `${m.weight} lb`}
                      {m.weight != null && m.body_fat_percentage != null && ' · '}
                      {m.body_fat_percentage != null && `${m.body_fat_percentage}% BF`}
                    </span>
                  </div>
                  {extras.length > 0 && (
                    <p className="atlas-body__history-extras">
                      {extras
                        .map((metric) => `${metric.label}: ${m[metric.key]}${metric.unit}`)
                        .join(' · ')}
                    </p>
                  )}
                  {m.notes && <p className="atlas-body__history-notes">{m.notes}</p>}

                  {confirmDeleteId === m.id ? (
                    <div className="atlas-body__history-actions">
                      <span>Delete this measurement?</span>
                      <button type="button" onClick={() => void handleDelete(m.id)}>
                        Delete
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="atlas-body__history-actions">
                      <button type="button" onClick={() => setEditingId(m.id)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteId(m.id)}>
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <button type="button" className="atlas-body__log-button" onClick={() => setShowForm(true)}>
        + Log Measurement
      </button>
    </div>
  );
}

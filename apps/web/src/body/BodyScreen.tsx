import { useEffect, useMemo, useState } from 'react';
import { weightSeries, bodyFatSeries, weightRollingAverageSeries } from '@atlas/body-composition';
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

/** Rows of history shown before "Show all" -- a long log should not bury the page. */
const HISTORY_PREVIEW = 8;

const round1 = (n: number) => Math.round(n * 10) / 10;

interface BodyScreenProps {
  /** Omit when the screen is a Progress section (its tab row is the navigation). */
  onBack?: () => void;
  /** Rendered inside Progress: no back button and no page title of its own. */
  embedded?: boolean;
}

/**
 * vNext Handoff 03B (§13). Body weight is the primary content; its 7-day
 * average is drawn quietly behind it, and only once enough weigh-ins exist.
 * Scale-reported composition values (body fat, lean mass, ...) are optional,
 * collapsed by default, and labeled as estimates rather than measurements.
 * Pure of storage, so the no-data / sparse / populated states are testable.
 */
export function BodySummary({
  measurements,
  onLog,
}: {
  measurements: BodyMeasurement[];
  onLog: () => void;
}) {
  const weightPoints = useMemo(() => weightSeries(measurements), [measurements]);
  const averagePoints = useMemo(() => weightRollingAverageSeries(measurements), [measurements]);
  const bodyFatPoints = useMemo(() => bodyFatSeries(measurements), [measurements]);
  const latestWeight = weightPoints[weightPoints.length - 1];
  const latestAverage = averagePoints[averagePoints.length - 1];
  const latestComposition = useMemo(
    () =>
      [...measurements]
        .sort((a, b) => b.date.localeCompare(a.date))
        .find((m) => METRIC_LABELS.some((metric) => m[metric.key] != null)),
    [measurements],
  );
  const hasComposition = bodyFatPoints.length > 0 || latestComposition != null;

  if (measurements.length === 0) {
    return (
      <section className="atlas-panel atlas-body__empty">
        <h2>No weigh-ins yet</h2>
        <p>Log your weight now and then and a trend builds here. Nothing else is required.</p>
        <button type="button" className="atlas-btn atlas-btn--primary" onClick={onLog}>
          Log first weigh-in
        </button>
      </section>
    );
  }

  return (
    <>
      <section className="atlas-panel atlas-body__summary" aria-labelledby="body-weight-title">
        <div className="atlas-body__summary-head">
          <h2 id="body-weight-title">Weight</h2>
          <button type="button" className="atlas-btn atlas-btn--secondary atlas-body__log" onClick={onLog}>
            + Log
          </button>
        </div>
        {latestWeight ? (
          <p className="atlas-body__latest">
            {round1(latestWeight.value)} <span>lb</span>
            <small> {formatDate(latestWeight.date)}</small>
          </p>
        ) : (
          <p className="atlas-body__hint">No weight recorded yet -- only other measurements.</p>
        )}
        {latestAverage && (
          <p className="atlas-body__average">7-day average {round1(latestAverage.value)} lb</p>
        )}
        <TrendChart
          points={weightPoints}
          unit=" lb"
          title="Body weight"
          secondary={averagePoints.length > 0 ? { points: averagePoints, label: '7-day average' } : undefined}
          xScale="date"
          showLastValue={false}
          minSpan={4}
        />
        {weightPoints.length > 0 && averagePoints.length === 0 && (
          <p className="atlas-body__hint">
            {weightPoints.length < 2
              ? 'A trend line appears after a few weigh-ins.'
              : 'A 7-day average appears once there are three weigh-ins within a week.'}
          </p>
        )}
      </section>

      {hasComposition && (
        <details className="atlas-panel atlas-body__composition">
          <summary>Body composition estimates</summary>
          <p className="atlas-body__hint">
            Values from a scale or entered by hand. Read them as a trend, not an exact measurement.
          </p>
          {bodyFatPoints.length > 0 && (
            <>
              <h3>Body fat</h3>
              <TrendChart points={bodyFatPoints} unit="%" title="Body fat" xScale="date" minSpan={2} />
            </>
          )}
          {latestComposition && (
            <p className="atlas-body__composition-latest">
              <strong>Latest ({formatDate(latestComposition.date)}):</strong>{' '}
              {METRIC_LABELS.filter((metric) => latestComposition[metric.key] != null)
                .map(
                  (metric) =>
                    `${metric.label} ${latestComposition[metric.key]}${metric.unit ? ` ${metric.unit}` : ''}`,
                )
                .join(' · ')}
            </p>
          )}
        </details>
      )}
    </>
  );
}

export function BodyScreen({ onBack, embedded = false }: BodyScreenProps) {
  const storage = useStorage();
  const [loading, setLoading] = useState(true);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

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
        {!embedded && <h1>Body</h1>}
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

  const visibleHistory = showAllHistory ? history : history.slice(0, HISTORY_PREVIEW);

  return (
    <div className="atlas-body">
      {!embedded && onBack && (
        <button type="button" className="atlas-template-editor__back" onClick={onBack}>
          &larr; Back
        </button>
      )}
      {!embedded && <h1>Body</h1>}

      <BodySummary measurements={measurements} onLog={() => setShowForm(true)} />

      {measurements.length > 0 && (
        <section aria-labelledby="body-history-title">
          <h2 id="body-history-title">Log</h2>
          <ul className="atlas-body__history-list">
            {visibleHistory.map((m) => {
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
          {history.length > HISTORY_PREVIEW && (
            <button
              type="button"
              className="atlas-link-button"
              onClick={() => setShowAllHistory((v) => !v)}
            >
              {showAllHistory ? 'Show fewer' : `Show all ${history.length}`}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

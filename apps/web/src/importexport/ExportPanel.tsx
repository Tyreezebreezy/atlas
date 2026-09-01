import { useEffect, useState } from 'react';
import type { Program, WorkoutTemplate } from '@atlas/data-model';
import {
  exportBackup,
  exportProgram,
  exportWorkout,
  validateAtlasPlan,
  restoreBackup,
  type AtlasBackupDocument,
} from '@atlas/import-export';
import { useStorage } from '../storage/StorageContext';

const MAX_RESTORE_FILE_BYTES = 20 * 1024 * 1024; // a full history backup can be larger than a single plan

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function slug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'export'
  );
}

interface ExportWorkoutPanelProps {
  onBack: () => void;
}

export function ExportWorkoutPanel({ onBack }: ExportWorkoutPanelProps) {
  const storage = useStorage();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);

  useEffect(() => {
    if (!storage) return;
    void storage.workoutTemplates.getAll().then(setTemplates);
  }, [storage]);

  async function handleExport(template: WorkoutTemplate) {
    if (!storage) return;
    const doc = await exportWorkout(template.id, storage);
    downloadJson(`atlas-workout-${slug(template.name)}.json`, doc);
  }

  return (
    <div className="atlas-importexport">
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Back
      </button>
      <h1>Export Workout</h1>
      {templates.length === 0 ? (
        <p className="atlas-program-screen__empty">No workouts to export yet.</p>
      ) : (
        <ul className="atlas-program-screen__list">
          {templates.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => void handleExport(template)}
                aria-label={`Export ${template.name}${template.is_quick_workout ? ' (Quick Workout)' : ''}`}
              >
                <span className="atlas-library__item-name" aria-hidden="true">
                  {template.name}
                  {template.is_quick_workout ? ' (Quick Workout)' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ExportProgramPanelProps {
  onBack: () => void;
}

export function ExportProgramPanel({ onBack }: ExportProgramPanelProps) {
  const storage = useStorage();
  const [programs, setPrograms] = useState<Program[]>([]);

  useEffect(() => {
    if (!storage) return;
    void storage.programs.getAll().then(setPrograms);
  }, [storage]);

  async function handleExport(program: Program) {
    if (!storage) return;
    const doc = await exportProgram(program.id, storage);
    downloadJson(`atlas-program-${slug(program.name)}.json`, doc);
  }

  return (
    <div className="atlas-importexport">
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Back
      </button>
      <h1>Export Program</h1>
      {programs.length === 0 ? (
        <p className="atlas-program-screen__empty">No programs to export yet.</p>
      ) : (
        <ul className="atlas-program-screen__list">
          {programs.map((program) => (
            <li key={program.id}>
              <button
                type="button"
                onClick={() => void handleExport(program)}
                aria-label={`Export ${program.name}`}
              >
                <span className="atlas-library__item-name" aria-hidden="true">
                  {program.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface BackupPanelProps {
  onBack: () => void;
}

type RestoreState =
  | { step: 'idle' }
  | { step: 'confirm'; document: AtlasBackupDocument }
  | { step: 'restoring' }
  | { step: 'done'; message: string }
  | { step: 'error'; message: string };

export function BackupPanel({ onBack }: BackupPanelProps) {
  const storage = useStorage();
  const [restoreState, setRestoreState] = useState<RestoreState>({ step: 'idle' });

  async function handleExportBackup() {
    if (!storage) return;
    const doc = await exportBackup(storage);
    downloadJson(`atlas-backup-${new Date().toISOString().slice(0, 10)}.json`, doc);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_RESTORE_FILE_BYTES) {
      setRestoreState({ step: 'error', message: 'That file is too large (limit 20 MB).' });
      return;
    }
    void file.text().then((text) => {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        setRestoreState({ step: 'error', message: 'That file is not valid JSON.' });
        return;
      }
      const validated = validateAtlasPlan(raw);
      if (!validated.valid || validated.value.kind !== 'backup') {
        setRestoreState({ step: 'error', message: 'That file is not a valid ATLAS backup.' });
        return;
      }
      setRestoreState({ step: 'confirm', document: validated.value });
    });
  }

  async function handleConfirmRestore() {
    if (!storage || restoreState.step !== 'confirm') return;
    setRestoreState({ step: 'restoring' });
    const result = await restoreBackup(restoreState.document, storage);
    const total = Object.values(result.restored_counts).reduce((sum, count) => sum + count, 0);
    setRestoreState({
      step: 'done',
      message: `Restored ${total} record${total === 1 ? '' : 's'}.`,
    });
  }

  return (
    <div className="atlas-importexport">
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Back
      </button>
      <h1>Full ATLAS Backup</h1>

      <section>
        <h2>Export</h2>
        <p className="atlas-importexport__hint">
          Everything needed to restore ATLAS on another device: Programs, Workouts, History, PRs,
          Milestones, Body Measurements, and custom exercises.
        </p>
        <button
          type="button"
          className="atlas-importexport__approve"
          onClick={() => void handleExportBackup()}
        >
          Export Full Backup
        </button>
      </section>

      <section>
        <h2>Restore</h2>
        {restoreState.step === 'idle' && (
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            aria-label="Choose a backup file"
          />
        )}
        {restoreState.step === 'confirm' && (
          <div>
            <p>
              This will add{' '}
              {Object.values(restoreState.document.entities).reduce((s, a) => s + a.length, 0)}{' '}
              record(s) to this ATLAS installation. Existing records with matching IDs will be
              overwritten with the backup&rsquo;s version. This can&rsquo;t be undone.
            </p>
            <div className="atlas-importexport__actions">
              <button type="button" onClick={() => setRestoreState({ step: 'idle' })}>
                Cancel
              </button>
              <button
                type="button"
                className="atlas-importexport__approve"
                onClick={() => void handleConfirmRestore()}
              >
                Restore
              </button>
            </div>
          </div>
        )}
        {restoreState.step === 'restoring' && <p>Restoring…</p>}
        {restoreState.step === 'done' && <p>{restoreState.message}</p>}
        {restoreState.step === 'error' && (
          <p className="atlas-importexport__row-warning">{restoreState.message}</p>
        )}
      </section>
    </div>
  );
}

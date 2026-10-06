import { useEffect, useState } from 'react';
import { localIsoDate } from '@atlas/core';
import type { Program, WorkoutTemplate } from '@atlas/data-model';
import {
  exportBackup,
  exportProgram,
  exportWorkout,
  validateAtlasPlan,
  restoreBackup,
  type AtlasBackupDocument,
} from '@atlas/import-export';
import { ensurePREventsUpToDate } from '../progress/prEvents';
import { useStorage } from '../storage/StorageContext';
import { FilePicker } from './FilePicker';

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
  const [exportNote, setExportNote] = useState<string | null>(null);

  async function handleExportBackup() {
    if (!storage) return;
    const doc = await exportBackup(storage);
    // The device's own day, not the UTC date (which is already tomorrow on a US evening).
    const filename = `atlas-backup-${localIsoDate()}.json`;
    downloadJson(filename, doc);
    // The file is saved the way the browser or device saves any download -- in the desktop app that is silently, into the
    // Downloads folder, with " (1)" added if the name is taken -- so say it was made, and where such files go.
    const records = Object.values(doc.entities).reduce((sum, rows) => sum + rows.length, 0);
    setExportNote(
      `Backup file created: ${filename} (${records} record${records === 1 ? '' : 's'}). It is saved with your other downloads (on a computer, usually the Downloads folder). Keep a copy somewhere safe.`,
    );
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
    // The built-in catalog is seeded only into an EMPTY exercise store. A backup brings the owner's custom exercises,
    // so restoring first on a device that has not seeded yet would make the store non-empty and the catalog would never
    // be seeded: make sure it exists before anything is written. (Dynamic, like everywhere else: it carries the dataset.)
    const { ensureExercisesSeeded } = await import('@atlas/exercise-library');
    await ensureExercisesSeeded(storage);
    const result = await restoreBackup(restoreState.document, storage);
    // A restore replaces history wholesale, and an older backup carries no PR event history: rebuild it from the restored sessions.
    await ensurePREventsUpToDate(storage, { force: true }).catch((error: unknown) => {
      console.error(
        'ATLAS: the PR event history could not be rebuilt after the restore; it is rebuilt at next launch.',
        error,
      );
    });
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
          Milestones, Body Measurements, custom exercises, and your Gyms &amp; Equipment.
        </p>
        <button
          type="button"
          className="atlas-importexport__approve"
          onClick={() => void handleExportBackup()}
        >
          Export Full Backup
        </button>
        {exportNote && (
          <p className="atlas-importexport__hint" role="status">
            {exportNote}
          </p>
        )}
      </section>

      <section>
        <h2>Restore</h2>
        {restoreState.step === 'idle' && (
          <>
            <p className="atlas-importexport__hint">
              Choose a backup you exported from ATLAS. Nothing changes until you confirm.
            </p>
            <FilePicker
              label="Choose backup file"
              accept=".json,application/json"
              onChange={handleFileChange}
            />
          </>
        )}
        {restoreState.step === 'confirm' && (
          <div>
            <p>
              This will add{' '}
              {Object.values(restoreState.document.entities).reduce((s, a) => s + a.length, 0)}{' '}
              record(s) to this ATLAS installation and keep everything already here. A record with
              the same ID is replaced by the backup&rsquo;s version, and the backup&rsquo;s active
              program and default gym take over. This can&rsquo;t be undone.
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
        {restoreState.step === 'done' && <p role="status">{restoreState.message}</p>}
        {restoreState.step === 'error' && (
          <>
            <p className="atlas-importexport__row-warning" role="alert">
              {restoreState.message}
            </p>
            {/* An unusable file must not strand the screen: choose another straight away. */}
            <FilePicker
              label="Choose another file"
              accept=".json,application/json"
              onChange={handleFileChange}
            />
          </>
        )}
      </section>
    </div>
  );
}

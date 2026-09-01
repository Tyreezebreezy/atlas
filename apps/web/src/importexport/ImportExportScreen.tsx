import { useState } from 'react';
import { BackupPanel, ExportProgramPanel, ExportWorkoutPanel } from './ExportPanel';
import { ImportWizard } from './ImportWizard';

type View = 'menu' | 'paste' | 'file' | 'export-workout' | 'export-program' | 'backup';

interface ImportExportScreenProps {
  onBack: () => void;
}

export function ImportExportScreen({ onBack }: ImportExportScreenProps) {
  const [view, setView] = useState<View>('menu');

  if (view === 'paste') return <ImportWizard mode="paste" onBack={() => setView('menu')} />;
  if (view === 'file') return <ImportWizard mode="file" onBack={() => setView('menu')} />;
  if (view === 'export-workout') return <ExportWorkoutPanel onBack={() => setView('menu')} />;
  if (view === 'export-program') return <ExportProgramPanel onBack={() => setView('menu')} />;
  if (view === 'backup') return <BackupPanel onBack={() => setView('menu')} />;

  return (
    <div className="atlas-importexport">
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Back
      </button>
      <h1>Import / Export</h1>

      <section>
        <h2>Import</h2>
        <ul className="atlas-program-screen__list">
          <li>
            <button type="button" onClick={() => setView('paste')} aria-label="Paste Text">
              <span className="atlas-library__item-name" aria-hidden="true">
                Paste Text
              </span>
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setView('file')} aria-label="Import File">
              <span className="atlas-library__item-name" aria-hidden="true">
                Import File
              </span>
            </button>
          </li>
        </ul>
      </section>

      <section>
        <h2>Export</h2>
        <ul className="atlas-program-screen__list">
          <li>
            <button
              type="button"
              onClick={() => setView('export-program')}
              aria-label="Export Program"
            >
              <span className="atlas-library__item-name" aria-hidden="true">
                Export Program
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setView('export-workout')}
              aria-label="Export Workout"
            >
              <span className="atlas-library__item-name" aria-hidden="true">
                Export Workout
              </span>
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setView('backup')} aria-label="Full ATLAS Backup">
              <span className="atlas-library__item-name" aria-hidden="true">
                Full ATLAS Backup
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}

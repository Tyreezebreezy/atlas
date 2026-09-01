import { useState } from 'react';
import {
  applyImport,
  buildImportPreview,
  parsePasteText,
  validateAtlasPlan,
  type ImportPreview,
  type ImportResolutions,
} from '@atlas/import-export';
import { useStorage } from '../storage/StorageContext';
import { ImportPreviewPanel } from './ImportPreviewPanel';

// Generous relative to any real pasted/typed workout or program, well below
// what would make browser-side JSON.parse/text parsing noticeably slow.
const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

type Step =
  | { step: 'source'; error: string | null }
  | { step: 'preview'; preview: ImportPreview; unparsedLines: string[] }
  | { step: 'saving' }
  | { step: 'done'; summary: string };

interface ImportWizardProps {
  mode: 'paste' | 'file';
  onBack: () => void;
}

export function ImportWizard({ mode, onBack }: ImportWizardProps) {
  const storage = useStorage();
  const [pasteText, setPasteText] = useState('');
  const [state, setState] = useState<Step>({ step: 'source', error: null });
  const [resolutions, setResolutions] = useState<ImportResolutions>({});

  async function parseAndPreview(kind: 'text' | 'json', text: string) {
    if (!storage) return;
    const library = await storage.exercises.getAll();

    if (kind === 'json') {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        setState({ step: 'source', error: 'That file is not valid JSON.' });
        return;
      }
      const validated = validateAtlasPlan(raw);
      if (!validated.valid) {
        const first = validated.issues[0];
        setState({
          step: 'source',
          error: first
            ? `${first.path}: ${first.message}`
            : 'This file does not match the ATLAS plan format.',
        });
        return;
      }
      if (validated.value.kind === 'backup') {
        setState({
          step: 'source',
          error:
            'This is a full ATLAS backup file -- restore it from More → Import / Export → Full ATLAS Backup instead.',
        });
        return;
      }
      const preview = buildImportPreview(validated.value, library);
      setResolutions({});
      setState({ step: 'preview', preview, unparsedLines: [] });
      return;
    }

    const { result, unparsedLines } = parsePasteText(text);
    const preview = buildImportPreview(result, library);
    setResolutions({});
    setState({ step: 'preview', preview, unparsedLines });
  }

  function handlePasteSubmit() {
    if (!pasteText.trim()) {
      setState({ step: 'source', error: 'Paste a workout or program first.' });
      return;
    }
    void parseAndPreview('text', pasteText);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setState({ step: 'source', error: 'That file is too large (limit 5 MB).' });
      return;
    }
    const isJson = file.name.toLowerCase().endsWith('.json');
    void file.text().then((text) => parseAndPreview(isJson ? 'json' : 'text', text));
  }

  async function handleApprove() {
    if (!storage || state.step !== 'preview') return;
    setState({ step: 'saving' });
    const result = await applyImport(state.preview, resolutions, storage);
    const savedName = result.workout_template?.name ?? result.program?.name ?? 'Import';
    const createdCount = result.created_exercises.length;
    const summary = `Saved "${savedName}".${createdCount > 0 ? ` Created ${createdCount} custom exercise${createdCount === 1 ? '' : 's'}.` : ''}`;
    setState({ step: 'done', summary });
  }

  if (state.step === 'done') {
    return (
      <div className="atlas-importexport__done">
        <h1>Import Complete</h1>
        <p>{state.summary}</p>
        <button type="button" onClick={onBack}>
          Done
        </button>
      </div>
    );
  }

  if (state.step === 'preview') {
    return (
      <>
        {state.unparsedLines.length > 0 && (
          <div className="atlas-importexport__unparsed">
            <p>These lines weren&rsquo;t recognized and were skipped:</p>
            <ul>
              {state.unparsedLines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        <ImportPreviewPanel
          preview={state.preview}
          resolutions={resolutions}
          onResolve={(key, resolution) =>
            setResolutions((prev) => ({ ...prev, [key]: resolution }))
          }
          onApprove={() => void handleApprove()}
          onCancel={onBack}
          saving={false}
        />
      </>
    );
  }

  if (state.step === 'saving') {
    return (
      <div className="atlas-importexport__done">
        <h1>Saving…</h1>
      </div>
    );
  }

  return (
    <div className="atlas-importexport">
      <button type="button" className="atlas-template-editor__back" onClick={onBack}>
        &larr; Back
      </button>
      <h1>{mode === 'paste' ? 'Paste Text' : 'Import File'}</h1>

      {mode === 'paste' ? (
        <>
          <p className="atlas-importexport__hint">
            Paste a workout or program from anywhere -- a trainer, a friend, a website, your own
            notes. ATLAS will attempt to structure it; you can fix anything before it&rsquo;s saved.
          </p>
          <textarea
            className="atlas-importexport__textarea"
            aria-label="Workout or program text to import"
            rows={12}
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder={'Monday — Upper\nBench Press\n4 × 6\nRest 2 min\n...'}
          />
          <button type="button" className="atlas-importexport__approve" onClick={handlePasteSubmit}>
            Parse
          </button>
        </>
      ) : (
        <>
          <p className="atlas-importexport__hint">
            Import an ATLAS plan file (.json), or a plain text/Markdown workout (.txt, .md).
          </p>
          <input
            type="file"
            accept=".json,.txt,.md,application/json,text/plain,text/markdown"
            onChange={handleFileChange}
            aria-label="Choose a file to import"
          />
        </>
      )}
      {state.error && <p className="atlas-importexport__row-warning">{state.error}</p>}
    </div>
  );
}

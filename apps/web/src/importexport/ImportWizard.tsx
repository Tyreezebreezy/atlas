import { useState } from 'react';
import {
  applyImport,
  buildImportPreview,
  parseHtmlPlan,
  parsePasteText,
  toHtmlImportOptions,
  validateAtlasPlan,
  type HtmlImportOption,
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
  | { step: 'choose-html-workout'; options: HtmlImportOption[]; unparsedText: string[] }
  | { step: 'preview'; preview: ImportPreview; unparsedLines: string[] }
  | { step: 'saving' }
  | { step: 'done'; summary: string };

function htmlFileTitle(html: string, fileName: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1]?.trim();
  if (title) return title;
  return fileName.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ');
}

interface ImportWizardProps {
  mode: 'paste' | 'file';
  onBack: () => void;
}

export function ImportWizard({ mode, onBack }: ImportWizardProps) {
  const storage = useStorage();
  const [pasteText, setPasteText] = useState('');
  const [state, setState] = useState<Step>({ step: 'source', error: null });
  const [resolutions, setResolutions] = useState<ImportResolutions>({});

  async function parseAndPreview(kind: 'text' | 'json' | 'html', text: string, fileName = '') {
    if (!storage) return;
    const library = await storage.exercises.getAll();

    if (kind === 'html') {
      const parsed = parseHtmlPlan(text);
      const options = toHtmlImportOptions(parsed, htmlFileTitle(text, fileName));
      if (options.length === 0) {
        setState({
          step: 'source',
          error: 'No checkbox-tracked exercises were recognized in that file.',
        });
        return;
      }
      if (options.length === 1 && options[0]) {
        const preview = buildImportPreview(options[0].input, library);
        setResolutions({});
        setState({ step: 'preview', preview, unparsedLines: parsed.unparsedText });
        return;
      }
      setState({ step: 'choose-html-workout', options, unparsedText: parsed.unparsedText });
      return;
    }

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
    const lowerName = file.name.toLowerCase();
    const kind = lowerName.endsWith('.json')
      ? 'json'
      : lowerName.endsWith('.html')
        ? 'html'
        : 'text';
    void file.text().then((text) => parseAndPreview(kind, text, file.name));
  }

  async function chooseHtmlOption(option: HtmlImportOption, unparsedText: string[]) {
    if (!storage) return;
    const library = await storage.exercises.getAll();
    const preview = buildImportPreview(option.input, library);
    setResolutions({});
    setState({ step: 'preview', preview, unparsedLines: unparsedText });
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

  if (state.step === 'choose-html-workout') {
    return (
      <div className="atlas-importexport">
        <button type="button" className="atlas-template-editor__back" onClick={onBack}>
          &larr; Back
        </button>
        <h1>Choose What to Import</h1>
        <p className="atlas-importexport__hint">
          This file contains {state.options.length} separate routines. Import one now -- you can
          come back and import the others the same way.
        </p>
        <ul className="atlas-importexport__row-list">
          {state.options.map((option) => (
            <li key={option.label} className="atlas-importexport__row">
              <span className="atlas-importexport__row-name">{option.label}</span>
              <div className="atlas-importexport__actions">
                <button
                  type="button"
                  onClick={() => void chooseHtmlOption(option, state.unparsedText)}
                >
                  Import
                </button>
              </div>
            </li>
          ))}
        </ul>
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
            Import an ATLAS plan file (.json), a plain text/Markdown workout (.txt, .md), or a
            checkbox-tracked workout page (.html) exported from a browser-based tracker.
          </p>
          <input
            type="file"
            accept=".json,.txt,.md,.html,application/json,text/plain,text/markdown,text/html"
            onChange={handleFileChange}
            aria-label="Choose a file to import"
          />
        </>
      )}
      {state.error && <p className="atlas-importexport__row-warning">{state.error}</p>}
    </div>
  );
}

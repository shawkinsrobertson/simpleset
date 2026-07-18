import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseFile, detectFileKind, extractTextFromPdf, extractTextFromDocx, parsePlanText, scanSections, needsSectionPicker } from '../parser';

export default function ImportPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const kind = detectFileKind(file);
      if (!kind) throw new Error(`Unsupported file type: "${file.name}". SimpleSet supports .docx, .xlsx, .pdf, and .txt files.`);

      const sourceState = {
        sourceType: 'local' as const,
        sourceFileName: file.name,
        sourceModifiedTime: String(file.lastModified),
      };

      // XLSX and plain text are already structured — skip the section picker.
      if (kind === 'xlsx' || kind === 'text') {
        const parsed = await parseFile(file);
        navigate('/confirm', { state: { parsedPlan: parsed, ...sourceState } });
        return;
      }

      // Extract text, then decide whether to show the section picker.
      const text = kind === 'pdf'
        ? await extractTextFromPdf(file)
        : await extractTextFromDocx(file);

      const fallbackName = file.name.replace(/\.[^.]+$/, '');

      // The section picker is only reliable for PDFs. DOCX/text formats use
      // circuit/tri-set structures where per-section exercise counts are
      // misleading, causing the picker to incorrectly mark real workout days
      // as unselected.
      if (kind === 'pdf') {
        const sections = scanSections(text);
        if (needsSectionPicker(sections)) {
          navigate('/import/sections', {
            state: { sections, extractedText: text, fallbackName, ...sourceState },
          });
          return;
        }
      }

      const parsed = parsePlanText(text, fallbackName);
      if (kind === 'pdf' && !text.trim()) {
        parsed.warnings.unshift('No text could be extracted from this PDF. Scanned/image-only PDFs are not supported — try exporting as a Word doc or spreadsheet instead.');
      }
      navigate('/confirm', { state: { parsedPlan: parsed, ...sourceState } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong parsing that file.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 px-5 pt-10">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text">Import your plan</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Bring an existing workout plan in from a file or Google Drive. We'll parse it and let you
          confirm the details before saving.
        </p>
      </div>

      <label
        htmlFor="plan-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragOver ? 'border-accent bg-accent/10' : 'border-border bg-card'
        }`}
      >
        <span className="font-medium text-text">
          {loading ? 'Parsing…' : 'Tap to upload, or drag a file here'}
        </span>
        <span className="text-xs text-text-secondary">.docx, .xlsx, .pdf, or .txt</span>
        <input
          ref={inputRef}
          id="plan-file"
          type="file"
          accept=".docx,.xlsx,.xls,.pdf,.txt,.csv"
          className="hidden"
          disabled={loading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </label>

      {error && (
        <div className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex items-center gap-3 text-xs text-text-secondary">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      <button
        onClick={() => navigate('/import/drive')}
        className="btn-secondary flex items-center justify-center gap-2 w-full px-6 py-4"
      >
        Connect Google Drive
      </button>

      <p className="text-center text-xs text-text-secondary">
        Scanned/image-only PDFs aren't supported yet — try exporting your plan as a Word doc or
        spreadsheet instead.
      </p>
    </div>
  );
}

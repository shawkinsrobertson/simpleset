import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseFile, detectFileKind, isAiParseConfigured } from '../parser';
import type { ParsedPlan } from '../parser';

function emptyManualPlan(): ParsedPlan {
  return {
    name: '',
    days: [{ tempId: crypto.randomUUID(), week: 1, label: 'New Day', exercises: [], groups: [] }],
    warnings: [],
  };
}

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
      if (!kind) throw new Error(`Unsupported file type: "${file.name}". simpleSet supports .docx, .xlsx, .pdf, and .txt files.`);

      const sourceState = {
        sourceType: 'local' as const,
        sourceFileName: file.name,
        sourceModifiedTime: String(file.lastModified),
      };

      // PDF (AI-assisted, with a local fallback), xlsx, and text are all
      // parsed entirely inside parseFile() — no section picker needed, the
      // AI backend handles filtering non-workout content for PDFs itself.
      const parsed = await parseFile(file);
      navigate('/confirm', { state: { parsedPlan: parsed, ...sourceState } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong parsing that file.');
    } finally {
      setLoading(false);
    }
  }

  function handleManualBuild() {
    navigate('/confirm', { state: { parsedPlan: emptyManualPlan(), sourceType: 'manual' as const } });
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

      <button
        onClick={handleManualBuild}
        className="btn-secondary flex items-center justify-center gap-2 w-full px-6 py-4"
      >
        Build a plan manually
      </button>

      <p className="text-center text-xs text-text-secondary">
        {isAiParseConfigured()
          ? 'PDF import (including scanned PDFs) uses an AI-assisted parsing service — see the privacy policy for details.'
          : "AI-assisted PDF import isn't configured for this deployment — PDFs fall back to basic text parsing, which may be less accurate."}
      </p>
    </div>
  );
}

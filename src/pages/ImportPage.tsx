import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseFile } from '../parser';

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
      const parsed = await parseFile(file);
      navigate('/confirm', {
        state: { parsedPlan: parsed, sourceType: 'local', sourceFileName: file.name },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong parsing that file.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 px-5 pt-10">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Import your plan</h1>
        <p className="mt-1 text-sm text-slate-500">
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
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white'
        }`}
      >
        <span className="text-3xl">📄</span>
        <span className="font-medium text-slate-700">
          {loading ? 'Parsing…' : 'Tap to upload, or drag a file here'}
        </span>
        <span className="text-xs text-slate-400">.docx, .xlsx, .pdf, or .txt</span>
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
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" />
        or
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <button
        onClick={() => navigate('/import/drive')}
        className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 font-medium text-slate-700 shadow-sm"
      >
        <span className="text-lg">🔗</span> Connect Google Drive
      </button>

      <p className="text-center text-xs text-slate-400">
        Scanned/image-only PDFs aren't supported yet — try exporting your plan as a Word doc or
        spreadsheet instead.
      </p>
    </div>
  );
}

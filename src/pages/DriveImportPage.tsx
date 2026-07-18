import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAccessToken, isDriveConfigured } from '../drive/googleAuth';
import { exportDriveFile, listPlanCandidateFiles } from '../drive/driveApi';
import type { DriveFile } from '../drive/driveApi';
import { parseCsv, parseText } from '../parser';

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default function DriveImportPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isDriveConfigured()) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 pt-20 text-center">
        <h1 className="text-xl font-semibold text-text">Google Drive isn't set up yet</h1>
        <p className="text-sm text-text-secondary">
          This deployment doesn't have a Google OAuth client configured. Set{' '}
          <code className="rounded bg-bg px-1 py-0.5 text-xs">VITE_GOOGLE_CLIENT_ID</code> to
          enable Drive import, or use file upload instead.
        </p>
        <button
          onClick={() => navigate('/import')}
          className="btn-primary mt-2 px-5 py-3"
        >
          Back to import
        </button>
      </div>
    );
  }

  const connect = async () => {
    setError(null);
    setLoading(true);
    try {
      const t = await getAccessToken();
      setToken(t);
      const results = await listPlanCandidateFiles(t);
      setFiles(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect to Google Drive.');
    } finally {
      setLoading(false);
    }
  };

  const search = async () => {
    if (!token) return;
    setLoading(true);
    try {
      setFiles(await listPlanCandidateFiles(token, query));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed.');
    } finally {
      setLoading(false);
    }
  };

  const pickFile = async (file: DriveFile) => {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const { text, kind } = await exportDriveFile(token, file);
      const fallbackName = file.name;
      const sourceState = {
        sourceType: 'drive' as const,
        sourceFileName: file.name,
        sourceFileId: file.id,
        sourceMimeType: file.mimeType,
        sourceModifiedTime: file.modifiedTime,
      };

      // Drive exports (both Docs and Sheets) come as clean plain text — no
      // embedded chapters or TOC pages — so we skip the section picker.
      const parsed = kind === 'sheet' ? parseCsv(text, fallbackName) : parseText(text, fallbackName);
      navigate('/confirm', { state: { parsedPlan: parsed, ...sourceState } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import that file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 px-5 pt-10">
      <div>
        <h1 className="text-2xl font-semibold text-text">Import from Google Drive</h1>
        <p className="mt-1 text-sm text-text-secondary">Pick a Doc or Sheet with your workout plan.</p>
      </div>

      {!token ? (
        <button
          onClick={connect}
          disabled={loading}
          className="btn-primary w-full py-3.5"
        >
          {loading ? 'Connecting…' : 'Connect Google Drive'}
        </button>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Search your files…"
              className="flex-1 rounded border border-border px-3 py-2.5"
            />
            <button onClick={search} className="rounded border border-border px-4 text-sm font-medium">
              Search
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {files.map((f) => (
              <button
                key={f.id}
                onClick={() => pickFile(f)}
                disabled={loading}
                className="flex items-center gap-3 rounded border border-border bg-card p-3 text-left disabled:opacity-50"
              >
                <span className="text-xl">
                  {f.mimeType.includes('spreadsheet') ? '📊' : '📄'}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-text">{f.name}</p>
                  <p className="text-xs text-text-secondary">Modified {dateFmt.format(new Date(f.modifiedTime))}</p>
                </div>
              </button>
            ))}
            {files.length === 0 && !loading && (
              <p className="text-center text-sm text-text-secondary">No Docs or Sheets found.</p>
            )}
          </div>
        </>
      )}

      {error && <div className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    </div>
  );
}

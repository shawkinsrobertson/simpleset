export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

const DOC_MIME = 'application/vnd.google-apps.document';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

export async function listPlanCandidateFiles(token: string, query?: string): Promise<DriveFile[]> {
  const mimeFilter = `(mimeType='${DOC_MIME}' or mimeType='${SHEET_MIME}')`;
  const nameFilter = query ? ` and name contains '${query.replace(/'/g, "\\'")}'` : '';
  const q = `${mimeFilter}${nameFilter} and trashed=false`;

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime)');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('pageSize', '25');

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive API error listing files (${res.status})`);
  const data = await res.json();
  return data.files ?? [];
}

async function exportFile(token: string, fileId: string, mimeType: string): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(mimeType)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive API error exporting file (${res.status})`);
  return res.text();
}

/** Exports a Google Doc as plain text, or a Google Sheet's first sheet as CSV. */
export async function exportDriveFile(token: string, file: DriveFile): Promise<{ text: string; kind: 'doc' | 'sheet' }> {
  if (file.mimeType === SHEET_MIME) {
    return { text: await exportFile(token, file.id, 'text/csv'), kind: 'sheet' };
  }
  return { text: await exportFile(token, file.id, 'text/plain'), kind: 'doc' };
}

/** Lightweight metadata-only check, used to gate re-sync prompts without a full export/parse. */
export async function getFileModifiedTime(token: string, fileId: string): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive API error fetching file metadata (${res.status})`);
  const data = await res.json();
  return data.modifiedTime;
}

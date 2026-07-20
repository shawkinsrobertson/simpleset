export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

const DOC_MIME = 'application/vnd.google-apps.document';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export function isFolder(file: DriveFile): boolean {
  return file.mimeType === FOLDER_MIME;
}

/**
 * Surfaces Google's actual error reason (e.g. "Google Drive API has not been
 * used in project ... before or it is disabled", "Request had insufficient
 * authentication scopes") instead of just the HTTP status — the status alone
 * isn't enough to tell a disabled-API misconfiguration apart from a scope or
 * permission problem.
 */
async function driveErrorMessage(res: Response, action: string): Promise<string> {
  try {
    const body = await res.json();
    const reason = body?.error?.message;
    return reason ? `Drive API error ${action} (${res.status}): ${reason}` : `Drive API error ${action} (${res.status})`;
  } catch {
    return `Drive API error ${action} (${res.status})`;
  }
}

/**
 * Lists the folders and plan-candidate files (Docs/Sheets) directly inside
 * `folderId` — pass `'root'` for the user's top-level My Drive. Folders are
 * always included alongside files so the caller can offer folder navigation
 * rather than a single flat search across the whole Drive.
 */
export async function listFolderContents(token: string, folderId: string, query?: string): Promise<DriveFile[]> {
  const mimeFilter = `(mimeType='${FOLDER_MIME}' or mimeType='${DOC_MIME}' or mimeType='${SHEET_MIME}')`;
  const nameFilter = query ? ` and name contains '${query.replace(/'/g, "\\'")}'` : '';
  const q = `'${folderId}' in parents and ${mimeFilter}${nameFilter} and trashed=false`;

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime)');
  url.searchParams.set('orderBy', 'name');
  url.searchParams.set('pageSize', '100');

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await driveErrorMessage(res, 'listing files'));
  const data = await res.json();
  const files: DriveFile[] = data.files ?? [];
  // Folders first (still alphabetical within each group, since we already
  // sorted by name) so the browsable structure reads clearly above the
  // actual plan files.
  return [...files.filter(isFolder), ...files.filter((f) => !isFolder(f))];
}

/** Global name search for plan-candidate files (Docs/Sheets) across the whole Drive, ignoring folder structure. */
export async function searchPlanCandidateFiles(token: string, query: string): Promise<DriveFile[]> {
  const mimeFilter = `(mimeType='${DOC_MIME}' or mimeType='${SHEET_MIME}')`;
  const nameFilter = ` and name contains '${query.replace(/'/g, "\\'")}'`;
  const q = `${mimeFilter}${nameFilter} and trashed=false`;

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime)');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('pageSize', '25');

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await driveErrorMessage(res, 'listing files'));
  const data = await res.json();
  return data.files ?? [];
}

async function exportFile(token: string, fileId: string, mimeType: string): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(mimeType)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await driveErrorMessage(res, 'exporting file'));
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
  if (!res.ok) throw new Error(await driveErrorMessage(res, 'fetching file metadata'));
  const data = await res.json();
  return data.modifiedTime;
}

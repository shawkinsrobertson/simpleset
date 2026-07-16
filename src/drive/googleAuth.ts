// Client-side Google Drive auth using Google Identity Services' OAuth token
// client. V1 is single-device/local-first, so we intentionally skip a
// server-brokered auth-code flow (and the Express backend that would imply):
// the token client runs entirely in the browser, the access token lives only
// in memory for the tab's lifetime, and nothing touches a server. If a
// refresh-token / offline-access flow is ever needed, that's the point to
// introduce the minimal Express broker described in the build spec.

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }): { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let scriptLoadPromise: Promise<void> | null = null;
let cachedToken: { token: string; expiresAt: number } | null = null;

export function getGoogleClientId(): string | undefined {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
}

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script.'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error(
      'Google Drive isn\'t configured for this deployment (missing VITE_GOOGLE_CLIENT_ID).',
    );
  }

  await loadGisScript();

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || 'Google sign-in was cancelled or failed.'));
          return;
        }
        cachedToken = { token: resp.access_token, expiresAt: Date.now() + 55 * 60 * 1000 };
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken({ prompt: cachedToken ? '' : 'consent' });
  });
}

export function isDriveConfigured(): boolean {
  return Boolean(getGoogleClientId());
}

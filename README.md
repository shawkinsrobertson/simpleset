# SimpleSet

Turn an existing workout plan (Google Doc/Sheet, Word, Excel, or PDF) into a
clean, app-like tracker. Import once, then log workouts and view stats
locally — V1 is single-device and local-first after import.

## Stack

- React + TypeScript + Vite, Tailwind CSS
- IndexedDB via [Dexie](https://dexie.org/) — the source of truth after import, nothing is synced to a server
- Parsing runs entirely in the browser: `mammoth` (.docx), `xlsx`/SheetJS (.xlsx, and Sheet CSV exports), `pdfjs-dist` (.pdf)
- Optional Google Drive import via Google Identity Services' client-side OAuth token flow (no backend — see "Google Drive" below)

## Getting started

```bash
npm install
npm run dev
```

Other scripts: `npm run build`, `npm run test` (vitest), `npm run lint` (oxlint).

## How it works

1. **Import** — upload a `.docx`/`.xlsx`/`.pdf`/`.txt` file, or connect Google Drive and pick a Doc/Sheet.
2. **Parse & confirm** — the parser assumes a narrow format (a day header, then exercise lines like `Bench Press 3x8 135lb`) and expands from there; spreadsheets with `Exercise`/`Sets`/`Reps`/`Weight`-style columns are read directly. Because free-form parsing is never perfect, every import lands on a confirm/edit screen before anything is saved.
3. **Track** — work through the plan day by day with a fast, thumb-friendly set logger (stepper inputs, one-tap logging, optional RPE).
4. **Stats** — volume over time, per-exercise weight/rep trends, and adherence (completed vs. skipped sessions).

## Google Drive import

V1 is local-first and single-device, so instead of a server-brokered OAuth
code flow (which would need an Express backend holding a client secret),
Drive import uses Google Identity Services' token client entirely in the
browser: the OAuth Client ID is public, the access token lives only in
memory for the tab's session, and nothing touches a server. If a
refresh-token / offline-access flow is ever needed, that's the point to
introduce a minimal Express broker.

To enable it, copy `.env.example` to `.env`, create an OAuth 2.0 Client ID
(Web application) in Google Cloud Console with the Drive API enabled, add
your dev origin to "Authorized JavaScript origins", and set
`VITE_GOOGLE_CLIENT_ID`. Without it, the Drive import screen shows a
"not configured" state and file upload still works normally.

## Non-goals (V1)

- Multi-device sync or cloud data storage
- Accounts/auth beyond what Drive OAuth requires
- Social/sharing/coach-client features
- In-app plan authoring — you bring an existing plan
- Continuous two-way Drive sync (re-import is fine; it's not automatic)
- OCR for scanned/image-only PDFs

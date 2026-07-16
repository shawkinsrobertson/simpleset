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
2. **Parse & confirm** — the parser assumes a narrow format (a day header, then exercise lines like `Bench Press 3x8 135lb` or a timed `Plank 3x30s, 30s rest`) and expands from there; spreadsheets with `Exercise`/`Sets`/`Reps`/`Weight`/`Time`/`Rest`-style columns are read directly. Because free-form parsing is never perfect, every import lands on a confirm/edit screen — a directly-editable spreadsheet-style grid (click any cell to fix it) rather than a form to step through — before anything is saved.
3. **Track** — work through the plan day by day with a fast, thumb-friendly set logger (stepper inputs for reps/weight or a duration for timed exercises like planks/holds, one-tap logging, optional RPE). Rest is shown as a prescription alongside the target, not something you log.
4. **Stats** — volume over time, per-exercise weight/rep trends, and adherence (completed vs. skipped sessions).
5. **Re-sync** — the source doc is treated as a living document. From Plans, "Re-sync from file" (or "Check for updates" for Drive plans) re-parses it and diffs against your current plan — see "Plan sync" below.

## Plan sync (re-import)

Logged history never depends on the live plan structure to make sense —
sets are snapshotted at log time, and exercises/days are archived rather
than deleted when they disappear from a re-imported doc, so old stats stay
queryable under their original identity.

- Exercises are matched by name (fuzzy) with position as a tiebreaker for
  duplicates; days are matched by label, not position, so a 4-day → 5-day
  restructure doesn't scramble identities.
- Each exercise is classified unchanged / modified / new / possibly-renamed
  / removed-from-doc. **Possibly-renamed matches are never auto-resolved**
  — the review screen asks "same exercise, or different?" before anything
  is written.
- Every re-sync review writes a `PlanVersion` audit row (visible under
  "Sync history" on the Plans tab), regardless of the timing choice below.
- Changes can be applied **immediately** or **from the next cycle** (once
  you finish the current rotation through the plan's days) — chosen per
  re-sync on the review screen.
- A re-sync mid-workout never retroactively alters an already-open or
  completed session; structural changes only affect days you haven't
  started yet.

See `src/sync/diff.ts` (matching/classification), `src/sync/applyPlan.ts`
(resolved diff → DB instructions), and `src/db/repo.ts`'s `confirmSync` /
`checkAndApplyPendingSync` (immediate vs. deferred apply).

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

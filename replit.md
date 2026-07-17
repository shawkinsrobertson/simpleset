# SimpleSet

A local-first workout tracker. Import an existing plan (Google Doc/Sheet, Word, Excel, or PDF), then log workouts and view stats — all in the browser via IndexedDB. No backend required.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Dexie (IndexedDB) — single source of truth after import
- Parsing: `mammoth` (.docx), `xlsx`/SheetJS (.xlsx), `pdfjs-dist` (.pdf)
- Google Drive import via GIS client-side OAuth (optional)

## Running the app

```bash
npm run dev        # dev server on port 5173
npm run build      # production build
npm run test       # vitest unit tests
npm run lint       # oxlint
```

The Replit workflow "Start application" runs `npm run dev`.

## Optional: Google Drive import

Set `VITE_GOOGLE_CLIENT_ID` in Replit Secrets (copy `.env.example` for reference). Without it, Drive import shows a "not configured" message; file upload still works.

## User preferences

- Focus areas: parser refinement and visual polish

---
name: Section picker design decisions
description: Why the section picker only fires for PDFs and what thresholds are used.
---

## The rule
`needsSectionPicker` is called only when the file `kind === 'pdf'` in ImportPage. DOCX and plain text always skip the picker and go straight to `parsePlanText`.

**Why:** DOCX/text files often use circuit or tri-set formats where exercise targets appear on shared "header" lines (e.g. "3 sets x 12 reps" after a block of exercise names). Within any single section detected by the scanner, only the shared target line counts — so MONDAY and WEDNESDAY sections show `exerciseCount = 0` even though they contain real workout content. Triggering the picker on these files would cause the auto-deselect logic to incorrectly mark workout days as empty. Alyssa's 12-week plan is the canonical example: 71% of its sections showed 0 exercises in the scanner.

## Threshold
`emptyCount >= 3 AND emptyCount / sections.length > 0.10` (10%).
- Functional Shred PDF: 19/121 = 15.7% → picker triggers ✓
- SFS PDF: similar pattern, triggers ✓
- Short/clean PDFs with ≤2 empty sections: skip ✓

## Heading detection in scanner (strict, NOT same as textParser)
The scanner uses `isHeadingForScanner`, which is intentionally stricter than `looksLikeHeaderFallback` in textParser.ts:
- Named patterns (WEEK, DAY, WEEKDAY, CALENDAR): always match
- SECTION_KEYWORD_RE (warm-up, workout, cool-down, weekdays): always match
- ALL CAPS multi-word (≥ 2 words): match
- **Single-word lines**: only match if they hit a named pattern (e.g. "Monday" via WEEKDAY_RE)
- **Title-case multi-word**: NOT matched — exercise names like "Down Dog to Arch" are title-case and would fragment PDFs into hundreds of tiny sections

**Why strict:** PDFs with decorative eBook titles extract each word on its own line ("The", "Functional", "Shred", "program") — the textParser fallback would create 500+ sections. The strict scanner produces ~120 sensible sections for Functional Shred.

## File wiring
- `ImportPage.tsx`: extracts text → runs scanner → if PDF and needsPicker → `/import/sections` → else parse directly
- `DriveImportPage.tsx`: skips picker entirely (Drive exports are clean text, no chapters)
- `SectionPickerPage.tsx`: receives `{ sections, extractedText, fallbackName, ... }` via route state; on confirm filters text and calls `parsePlanText`

## Auto-selection
Sections with `exerciseCount > 0` are pre-selected; others are unchecked by default.
Quick actions: "Workouts only" / "Select all" / "None".
"Parse entire document instead" link always available as escape hatch.

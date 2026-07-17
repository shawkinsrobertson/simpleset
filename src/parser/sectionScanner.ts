/**
 * Lightweight first-pass scanner that splits extracted document text into
 * labelled sections and estimates exercise density per section.
 *
 * This runs BEFORE the full text parser so the user can deselect intro/
 * nutrition/outro pages before committing to the full parse.
 *
 * IMPORTANT: the heading detector here is intentionally STRICTER than the one
 * in textParser.ts. textParser.ts uses a permissive fallback so it can split
 * any exercise list into days; here we want large, meaningful sections — not
 * one section per prose fragment.
 */

import { normalizeLine, looksLikeTargetLine, stripBulletExport } from './textParser';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DocumentSection {
  /** Stable id for React keys / state identity. */
  id: string;
  /** The heading text that opened this section (or a synthetic label). */
  title: string;
  /** Index into the raw lines array, inclusive. */
  lineStart: number;
  /** Index into the raw lines array, exclusive. */
  lineEnd: number;
  /** Lines within this section that contain recognisable workout targets. */
  exerciseCount: number;
  /** Total non-empty, non-heading lines in this section. */
  lineCount: number;
  /** Whether the user has selected this section for parsing. */
  selected: boolean;
}

// ─── Heading patterns (mirrors textParser but no fallback for short lines) ────

const WEEK_RE = /^week\s*\d+\b/i;
const DAY_RE = /^day\s*\d+\b/i;
const WEEKDAY_RE =
  /^(mon(day)?|tue(s|sday)?|wed(nesday)?|thu(rs|rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b/i;
const CALENDAR_DATE_RE =
  /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}/i;
// Single-word section keywords are reliable enough to stand alone.
const SECTION_KEYWORD_RE =
  /^(warm[\s-]?up|main\s*set|cool[\s-]?down|circuit|superset|finisher|workout|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Table-of-contents lines: "Nutrition . . . . 8". Not exercises, not headings. */
const TOC_LINE_RE = /[.·]{3,}\s*\d+\s*$/;

/** Prose sentence: long line with no digits → skip in exercise counting. */
function isProseLine(line: string): boolean {
  return line.length > 80 && !/\d/.test(line);
}

/**
 * Stricter heading check for the scanner.
 *
 * The key rule: require at least 2 words for any fallback heuristic.
 * PDF documents (especially eBooks) often extract decorative title text
 * as one word per line — "The", "Functional", "Shred", "program" — and
 * we do NOT want those treated as section breaks.
 *
 * Named patterns (WEEK/DAY/WEEKDAY/CALENDAR) and section keywords are
 * reliable regardless of word count.
 */
function isHeadingForScanner(line: string): boolean {
  if (!line) return false;
  if (looksLikeTargetLine(line)) return false;
  if (TOC_LINE_RE.test(line)) return false;

  // Named structural patterns — reliable, no word-count restriction.
  if (WEEK_RE.test(line)) return true;
  if (DAY_RE.test(line)) return true;
  if (WEEKDAY_RE.test(line)) return true;
  if (CALENDAR_DATE_RE.test(line)) return true;

  // Known workout-section keywords — single words like "WORKOUT" are fine,
  // but require the line to be short and contain no sentence punctuation.
  // This prevents prose sentences like "cool down. By clicking on a
  // highlighted exercise…" from being treated as headings.
  if (SECTION_KEYWORD_RE.test(line) && line.length <= 50 && !/[.;]/.test(line)) return true;

  // All other heuristic heading detection requires ≥ 2 words.
  // This filters single-word PDF-title fragments and isolated prose words.
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 8) return false;
  if (line.length > 60) return false;
  if (/[.!?]$/.test(line)) return false; // prose sentences end with punctuation

  // ALL CAPS multi-word headings (e.g. "TABLE OF CONTENTS", "WEEK 1 + 2").
  if (/[A-Z]/.test(line) && line === line.toUpperCase()) return true;

  return false;
}

/** True when a normalised line looks like workout content for section density. */
function isExerciseLine(line: string): boolean {
  if (!line) return false;
  if (TOC_LINE_RE.test(line)) return false;
  if (isProseLine(line)) return false;
  return looksLikeTargetLine(line);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Split `text` (already extracted from the document) into sections, estimating
 * exercise density for each. Returns sections with auto-selected state:
 * sections with at least one exercise line are selected; others are not.
 */
export function scanSections(text: string): DocumentSection[] {
  const rawLines = text.split(/\r?\n/);
  const sections: DocumentSection[] = [];

  let title = '';
  let lineStart = 0;
  let exerciseCount = 0;
  let lineCount = 0;
  let firstContent = true;

  const flush = (end: number) => {
    if (end <= lineStart && lineCount === 0 && sections.length === 0) return;
    sections.push({
      id: crypto.randomUUID(),
      title: title || '(intro)',
      lineStart,
      lineEnd: end,
      exerciseCount,
      lineCount,
      selected: false, // resolved after full scan
    });
  };

  for (let i = 0; i < rawLines.length; i++) {
    // Strip form-feed page-break characters that pdftotext emits.
    const raw = rawLines[i].replace(/\f/g, '').trim();
    if (!raw) continue;

    const normalised = stripBulletExport(normalizeLine(raw));
    if (!normalised) continue;

    // Very first non-empty, non-heading line → treat as plan title / intro stub.
    if (firstContent) {
      firstContent = false;
      if (!isHeadingForScanner(normalised)) {
        title = normalised;
        lineStart = i;
        continue;
      }
    }

    if (isHeadingForScanner(normalised)) {
      flush(i);
      title = normalised;
      lineStart = i;
      exerciseCount = 0;
      lineCount = 0;
    } else {
      lineCount++;
      if (isExerciseLine(normalised)) exerciseCount++;
    }
  }

  flush(rawLines.length);

  // Auto-select sections that contain at least one exercise line.
  return sections.map((s) => ({ ...s, selected: s.exerciseCount > 0 }));
}

/**
 * Returns true when the picker should be shown to the user.
 *
 * Criteria: at least 3 zero-exercise sections AND those sections make up
 * more than 10 % of all sections. A 10 % bar catches eBook-style PDFs
 * (e.g. 19/121 = 16 %) while still passing through short/clean plans.
 *
 * NOTE: callers should only invoke this for PDFs. DOCX/text formats use
 * circuit/tri-set structures where targets appear on shared lines and the
 * per-section exercise count is unreliable — showing the picker there
 * would incorrectly auto-deselect real workout days.
 */
export function needsSectionPicker(sections: DocumentSection[]): boolean {
  if (sections.length < 4) return false;
  const emptyCount = sections.filter((s) => s.exerciseCount === 0).length;
  return emptyCount >= 5;
}

/**
 * Rebuild a text string containing only the raw lines that belong to selected
 * sections, preserving the original text exactly so `parsePlanText` can apply
 * its own normalisation.
 *
 * Falls back to the full text if nothing is selected (safety valve).
 */
export function filterTextToSections(
  text: string,
  sections: DocumentSection[],
): string {
  const selected = sections.filter((s) => s.selected);
  if (selected.length === 0) return text;

  const lines = text.split(/\r?\n/);
  const parts: string[] = [];
  for (const s of selected) {
    parts.push(lines.slice(s.lineStart, s.lineEnd).join('\n'));
  }
  return parts.join('\n');
}

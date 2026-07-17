import * as XLSX from 'xlsx';
import type { ParsedDay, ParsedExercise, ParsedPlan } from './types';
import { parsePlanText } from './textParser';

const HEADER_ALIASES: Record<string, string[]> = {
  week: ['week', 'wk', 'week #', 'week number'],
  day: ['day', 'session', 'workout', 'day #', 'day number', 'training day'],
  exercise: ['exercise', 'movement', 'lift', 'name', 'exercise name', 'movement name', 'exercise/movement', 'lift name'],
  sets: ['sets', 'set', '# sets', 'num sets', 'number of sets', 'total sets'],
  reps: ['reps', 'rep', 'reps/set', 'rep range', 'reps per set', 'repetitions'],
  weight: ['weight', 'load', 'lbs', 'kg', 'weight (lbs)', 'weight (kg)', 'load (lbs)', 'load (kg)', 'weight/load', 'intensity'],
  time: ['time', 'duration', 'hold', 'time (s)', 'time (sec)', 'duration (s)', 'seconds', 'time under tension'],
  rest: ['rest', 'rest time', 'rest (s)', 'rest (sec)', 'rest period', 'recovery', 'rest between sets'],
  notes: ['notes', 'note', 'comments', 'comment', 'rpe', 'coaching notes', 'cues', 'instructions', 'tempo'],
};

/**
 * Normalise a spreadsheet cell value that represents a number of sets,
 * stripping common verbose suffixes ("3 sets" → "3").
 */
function normaliseSetsCell(raw: string): string {
  return raw.replace(/\s*sets?\b.*/i, '').trim();
}

/**
 * Normalise a spreadsheet cell value that represents reps, stripping
 * verbose suffixes so the confirm screen shows clean values.
 * "8-10 reps" → "8-10", "3 sets x 8 reps" → "8", "AMRAP" → "amrap".
 */
function normaliseRepsCell(raw: string): string {
  // "N sets x M reps" or "N sets of M reps" — extract M
  const setsRepsMatch = /\d+\s*(?:sets?\s+(?:of|x|×))\s*(\S+)\s*(?:reps?)?/i.exec(raw);
  if (setsRepsMatch) return setsRepsMatch[1].toLowerCase().replace(/\s*-\s*/, '-');
  // Strip trailing "reps?" suffix
  return raw.replace(/\s*reps?\b/i, '').replace(/^to\s+/i, '').trim() || raw.trim();
}

/**
 * Normalise a weight cell: "135 lbs" → "135lb", "60kg" → "60kg".
 * Returns the raw string unchanged when no unit is found (numeric-only
 * values are kept as-is so the confirm screen shows them).
 */
function normaliseWeightCell(raw: string): string {
  const m = /^(\d+(?:\.\d+)?)\s*(lbs?|kgs?|kg|%)?$/i.exec(raw.trim());
  if (!m) return raw.trim();
  const unit = m[2] ? m[2].toLowerCase().replace(/^lbs$/, 'lb').replace(/^kgs$/, 'kg') : '';
  return `${m[1]}${unit}`;
}

function detectColumns(headerRow: unknown[]): Record<string, number> | null {
  const cols: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const val = String(cell ?? '').trim().toLowerCase();
    if (!val) return;
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (key in cols) continue; // first match wins
      if (aliases.some((a) => val === a || val.startsWith(a + ' ') || val.startsWith(a + '/'))) {
        cols[key] = idx;
        return;
      }
      // Looser: column header contains the alias (e.g. "exercise name" contains "exercise")
      if (aliases.some((a) => a.length >= 4 && val.includes(a))) {
        cols[key] = idx;
      }
    }
  });
  // Require at minimum an "exercise" column to trust this as a structured header.
  return 'exercise' in cols ? cols : null;
}

function parseStructuredSheet(rows: unknown[][], cols: Record<string, number>): ParsedPlan {
  const days: ParsedDay[] = [];
  const warnings: string[] = [];
  let currentDay: ParsedDay | null = null;
  let currentWeek = 1;
  let lastDayLabel = '';

  for (const row of rows) {
    const get = (key: string) => {
      const idx = cols[key];
      if (idx === undefined) return '';
      return String(row[idx] ?? '').trim();
    };

    const exerciseName = get('exercise');
    if (!exerciseName) continue;

    const weekVal = get('week');
    if (weekVal) {
      const n = parseInt(weekVal, 10);
      if (!Number.isNaN(n)) currentWeek = n;
    }

    const dayVal = get('day') || `Week ${currentWeek}`;
    if (!currentDay || dayVal !== lastDayLabel) {
      currentDay = { tempId: crypto.randomUUID(), week: currentWeek, label: dayVal, exercises: [], groups: [] };
      days.push(currentDay);
      lastDayLabel = dayVal;
    }

    const rawSets = get('sets');
    const rawReps = get('reps');
    const rawWeight = get('weight');
    const rawTime = get('time');
    const rawRest = get('rest');
    const notesVal = get('notes');

    const normSets = rawSets ? normaliseSetsCell(rawSets) : '';
    const normReps = rawReps ? normaliseRepsCell(rawReps) : '';
    const normWeight = rawWeight ? normaliseWeightCell(rawWeight) : '';

    const exercise: ParsedExercise = {
      tempId: crypto.randomUUID(),
      name: exerciseName,
      targetSets: normSets ? Number(normSets) || null : null,
      targetReps: normReps || null,
      targetWeight: normWeight || null,
      targetTime: rawTime || null,
      targetRest: rawRest || null,
      notes: notesVal || null,
      groupTempId: null,
      raw: row.map((c) => String(c ?? '')).join(' | '),
    };
    currentDay.exercises.push(exercise);
  }

  const filteredDays = days.filter((d) => d.exercises.length > 0);
  const noTargetCount = filteredDays
    .flatMap((d) => d.exercises)
    .filter((e) => e.targetSets === null && e.targetReps === null && e.targetTime === null).length;
  if (noTargetCount > 0) {
    warnings.push(
      `${noTargetCount} exercise${noTargetCount === 1 ? '' : 's'} couldn't be matched to sets/reps/time — they're included below so you can fill them in.`,
    );
  }

  return { name: '', days: filteredDays, warnings };
}

export function parseSheetRows(rows: unknown[][], fallbackName: string): ParsedPlan {
  if (rows.length === 0) {
    return { name: fallbackName, days: [], warnings: ['The spreadsheet appears to be empty.'] };
  }

  // Scan the first few rows for a recognisable header rather than assuming
  // row 0 is always the header. Many real-world spreadsheets have a title
  // row (or blank rows) above the actual column names.
  let headerCols: Record<string, number> | null = null;
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const cols = detectColumns(rows[i]);
    if (cols) {
      headerCols = cols;
      headerRowIdx = i;
      break;
    }
  }

  if (headerCols && headerRowIdx >= 0) {
    const result = parseStructuredSheet(rows.slice(headerRowIdx + 1), headerCols);
    return { ...result, name: fallbackName };
  }

  // Fallback: no recognizable header row — treat each row as a text line
  // (joining non-empty cells) and run it through the same heuristic
  // parser used for docx/pdf.
  const asText = rows
    .map((row) => row.map((c) => String(c ?? '').trim()).filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n');
  return parsePlanText(asText, fallbackName);
}

export function parseXlsxFile(file: File, fallbackName: string): Promise<ParsedPlan> {
  return file.arrayBuffer().then((buf) => {
    const workbook = XLSX.read(buf, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
    return parseSheetRows(rows, fallbackName);
  });
}

export function parseCsvText(csvText: string, fallbackName: string): ParsedPlan {
  const workbook = XLSX.read(csvText, { type: 'string' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  return parseSheetRows(rows, fallbackName);
}

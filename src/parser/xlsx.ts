import * as XLSX from 'xlsx';
import type { ParsedDay, ParsedExercise, ParsedPlan } from './types';
import { parsePlanText } from './textParser';

const HEADER_ALIASES: Record<string, string[]> = {
  week: ['week', 'wk'],
  day: ['day', 'session', 'workout'],
  exercise: ['exercise', 'movement', 'lift'],
  sets: ['sets', 'set'],
  reps: ['reps', 'rep'],
  weight: ['weight', 'load', 'lbs', 'kg'],
  time: ['time', 'duration', 'hold'],
  rest: ['rest', 'rest time'],
  notes: ['notes', 'note', 'comments', 'rpe'],
};

function detectColumns(headerRow: unknown[]): Record<string, number> | null {
  const cols: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const val = String(cell ?? '').trim().toLowerCase();
    if (!val) return;
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => val === a || val.startsWith(a))) {
        if (!(key in cols)) cols[key] = idx;
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

    const setsVal = get('sets');
    const repsVal = get('reps');
    const weightVal = get('weight');
    const timeVal = get('time');
    const restVal = get('rest');
    const notesVal = get('notes');

    const exercise: ParsedExercise = {
      tempId: crypto.randomUUID(),
      name: exerciseName,
      targetSets: setsVal ? Number(setsVal) || null : null,
      targetReps: repsVal || null,
      targetWeight: weightVal || null,
      targetTime: timeVal || null,
      targetRest: restVal || null,
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

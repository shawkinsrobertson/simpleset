/**
 * Node.js test harness — ports the browser parser logic to run on disk files.
 * Usage: node scripts/test-parser.mjs <file>
 */

import { readFile } from 'fs/promises';
import { basename, extname } from 'path';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

// ── duration helpers (mirrors src/lib/duration.ts) ──────────────────────────
const TIME_UNIT_FRAGMENT = '(?:s|sec|secs|seconds|min|mins|minutes)';
function formatTime(value, unit) {
  return `${value}${/^min/i.test(unit) ? 'min' : 's'}`;
}

// ── textParser (mirrors src/parser/textParser.ts) ───────────────────────────
const BULLET_RE = /^[\s]*[-*•‣▪·]\s*|^\s*\d+[.)]\s+/;
const WEEK_RE = /^week\s*(\d+)\b\s*[:\-–]?\s*(.*)$/i;
const WEEKDAY_RE = /^(mon(day)?|tue(s|sday)?|wed(nesday)?|thu(rs|rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b/i;
const DAY_RE = /^day\s*(\d+)\b\s*[:\-–]?\s*(.*)$/i;

const SET_REP_WEIGHT_RE =
  /(?<sets>\d+)\s*(?:x|×|sets?\s+of)\s*(?<reps>\d+(?:\s*-\s*\d+)?|amrap|max(?:imum)?)\s*(?:reps?)?(?:\s*(?:(?:x|×|@|at)\s*(?<weightA>\d+(?:\.\d+)?)\s*(?<unitA>lbs?|kgs?|kg|%)?|(?<weightB>\d+(?:\.\d+)?)\s*(?<unitB>lbs?|kgs?|kg|%)))?/i;

const SETS_TIME_RE = new RegExp(
  `(?<sets>\\d+)\\s*(?:x|×|sets?\\s+of)\\s*(?<time>\\d+(?:\\.\\d+)?)\\s*(?<timeUnit>${TIME_UNIT_FRAGMENT})\\b`,
  'i',
);

const TIME_ONLY_RE = new RegExp(
  `(?<time>\\d+(?:\\.\\d+)?)\\s*(?<timeUnit>${TIME_UNIT_FRAGMENT})\\b(?:\\s*hold)?`,
  'i',
);

const REST_RE = new RegExp(
  `(?:^|[\\s,;])(?:(\\d+(?:\\.\\d+)?)\\s*(${TIME_UNIT_FRAGMENT})\\s*rest\\b|rest\\s*(?:of|for)?\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*(${TIME_UNIT_FRAGMENT}))`,
  'i',
);

function extractRest(text) {
  if (!text) return { rest: null, remaining: text };
  const m = REST_RE.exec(text);
  if (!m) return { rest: null, remaining: text };
  const value = m[1] ?? m[3];
  const unit = m[2] ?? m[4];
  const remaining = (text.slice(0, m.index) + text.slice(m.index + m[0].length))
    .replace(/^[\s,;]+|[\s,;]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { rest: formatTime(value, unit), remaining };
}

function stripBullet(line) { return line.replace(BULLET_RE, '').trim(); }

function looksLikeTargetLine(line) {
  return SET_REP_WEIGHT_RE.test(line) || SETS_TIME_RE.test(line) || TIME_ONLY_RE.test(line);
}

function looksLikeHeaderFallback(line) {
  if (looksLikeTargetLine(line)) return false;
  if (line.length > 45) return false;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  if (/[.!?]$/.test(line)) return false;
  return true;
}

const SECTION_KEYWORD_RE = /^(warm[\s-]?up|main\s*set|cool[\s-]?down|circuit|superset|finisher)\b/i;

function looksLikeSectionHeader(line) {
  if (!looksLikeHeaderFallback(line)) return false;
  if (SECTION_KEYWORD_RE.test(line)) return true;
  return /[A-Z]/.test(line) && line === line.toUpperCase();
}

function splitNameAndTrailing(line, matchIndex, matchLength) {
  const name = line.slice(0, matchIndex).trim().replace(/[-:–,]+$/, '').trim();
  const trailing = line.slice(matchIndex + matchLength).trim().replace(/^[-:–,]+/, '').trim();
  return { name, trailing };
}

function parseExerciseLine(rawLine) {
  const line = stripBullet(rawLine);
  if (!line) return null;

  const setsTimeMatch = SETS_TIME_RE.exec(line);
  if (setsTimeMatch) {
    const g = setsTimeMatch.groups;
    const { name, trailing } = splitNameAndTrailing(line, setsTimeMatch.index, setsTimeMatch[0].length);
    const { rest, remaining } = extractRest(trailing);
    return { name: name || '(unnamed)', targetSets: Number(g.sets), targetReps: null, targetWeight: null, targetTime: formatTime(g.time, g.timeUnit), targetRest: rest, notes: remaining || null, raw: rawLine };
  }

  const repMatch = SET_REP_WEIGHT_RE.exec(line);
  if (repMatch) {
    const g = repMatch.groups;
    const weight = g.weightA ?? g.weightB;
    const unit = g.unitA ?? g.unitB;
    const { name, trailing } = splitNameAndTrailing(line, repMatch.index, repMatch[0].length);
    const { rest, remaining } = extractRest(trailing);
    return { name: name || '(unnamed)', targetSets: Number(g.sets), targetReps: g.reps.replace(/\s*-\s*/, '-').toLowerCase(), targetWeight: weight ? `${weight}${unit ? unit.toLowerCase() : ''}` : null, targetTime: null, targetRest: rest, notes: remaining || null, raw: rawLine };
  }

  const timeOnlyMatch = TIME_ONLY_RE.exec(line);
  if (timeOnlyMatch) {
    const g = timeOnlyMatch.groups;
    const { name, trailing } = splitNameAndTrailing(line, timeOnlyMatch.index, timeOnlyMatch[0].length);
    const { rest, remaining } = extractRest(trailing);
    return { name: name || '(unnamed)', targetSets: null, targetReps: null, targetWeight: null, targetTime: formatTime(g.time, g.timeUnit), targetRest: rest, notes: remaining || null, raw: rawLine };
  }

  return { name: line, targetSets: null, targetReps: null, targetWeight: null, targetTime: null, targetRest: null, notes: null, raw: rawLine };
}

function parsePlanText(text, fallbackName) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const days = [];
  const warnings = [];
  let currentWeek = 1;
  let currentDay = null;
  let dayOrder = 0;
  let planName = fallbackName;
  let sawAnyHeader = false;

  const ensureDay = (label, week) => {
    currentDay = { week, label, exercises: [] };
    days.push(currentDay);
    dayOrder += 1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = stripBullet(lines[i]);
    if (!line) continue;

    if (i === 0 && !WEEK_RE.test(line) && !DAY_RE.test(line) && !WEEKDAY_RE.test(line) && !looksLikeTargetLine(line)) {
      planName = line;
      continue;
    }

    const weekMatch = WEEK_RE.exec(line);
    if (weekMatch) {
      currentWeek = Number(weekMatch[1]);
      sawAnyHeader = true;
      const rest = weekMatch[2]?.trim();
      if (rest) ensureDay(rest, currentWeek);
      continue;
    }

    const dayMatch = DAY_RE.exec(line);
    if (dayMatch) {
      ensureDay(line, currentWeek);
      sawAnyHeader = true;
      continue;
    }

    if (WEEKDAY_RE.test(line) && !looksLikeTargetLine(line)) {
      ensureDay(line, currentWeek);
      sawAnyHeader = true;
      continue;
    }

    if (!currentDay && looksLikeHeaderFallback(line)) {
      ensureDay(line, currentWeek);
      sawAnyHeader = true;
      continue;
    }

    if (currentDay && looksLikeSectionHeader(line)) {
      ensureDay(line, currentWeek);
      continue;
    }

    if (!currentDay) {
      ensureDay(`Day ${dayOrder + 1}`, currentWeek);
      warnings.push(`No header before "${line}" — grouped under "${currentDay.label}".`);
    }

    const ex = parseExerciseLine(line);
    if (ex) {
      if (ex.targetSets === null && ex.targetReps === null && ex.targetTime === null) {
        warnings.push(`No sets/reps/time for "${ex.name}"`);
      }
      currentDay.exercises.push(ex);
    }
  }

  const nonEmptyDays = days.filter(d => d.exercises.length > 0);
  if (!sawAnyHeader) warnings.unshift('No clear day headers found — review the day breakdown.');
  if (nonEmptyDays.length === 0) warnings.unshift('No exercises could be parsed.');

  return { name: planName, days: nonEmptyDays, warnings };
}

// ── xlsx parser (mirrors src/parser/xlsx.ts) ─────────────────────────────────
const HEADER_ALIASES = {
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

function detectColumns(headerRow) {
  const cols = {};
  headerRow.forEach((cell, idx) => {
    const val = String(cell ?? '').trim().toLowerCase();
    if (!val) return;
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some(a => val === a || val.startsWith(a))) {
        if (!(key in cols)) cols[key] = idx;
      }
    }
  });
  return 'exercise' in cols ? cols : null;
}

function parseStructuredSheet(rows, cols, fallbackName) {
  const days = [];
  const warnings = [];
  let currentDay = null;
  let currentWeek = 1;
  let lastDayLabel = '';

  for (const row of rows) {
    const get = key => {
      const idx = cols[key];
      if (idx === undefined) return '';
      return String(row[idx] ?? '').trim();
    };
    const exerciseName = get('exercise');
    if (!exerciseName) continue;

    const weekVal = get('week');
    if (weekVal) { const n = parseInt(weekVal, 10); if (!isNaN(n)) currentWeek = n; }

    const dayVal = get('day') || `Week ${currentWeek}`;
    if (!currentDay || dayVal !== lastDayLabel) {
      currentDay = { week: currentWeek, label: dayVal, exercises: [] };
      days.push(currentDay);
      lastDayLabel = dayVal;
    }

    const exercise = {
      name: exerciseName,
      targetSets: get('sets') ? Number(get('sets')) || null : null,
      targetReps: get('reps') || null,
      targetWeight: get('weight') || null,
      targetTime: get('time') || null,
      targetRest: get('rest') || null,
      notes: get('notes') || null,
      raw: row.map(c => String(c ?? '')).join(' | '),
    };
    if (!exercise.targetSets && !exercise.targetReps && !exercise.targetTime) {
      warnings.push(`No sets/reps/time for "${exercise.name}"`);
    }
    currentDay.exercises.push(exercise);
  }

  return { name: fallbackName, days: days.filter(d => d.exercises.length > 0), warnings };
}

function parseXlsxBuffer(buf, fallbackName) {
  const workbook = XLSX.read(buf, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  if (rows.length === 0) return { name: fallbackName, days: [], warnings: ['Empty spreadsheet.'] };
  const headerCols = detectColumns(rows[0]);
  if (headerCols) return parseStructuredSheet(rows.slice(1), headerCols, fallbackName);
  const asText = rows.map(row => row.map(c => String(c ?? '').trim()).filter(Boolean).join(' ')).filter(Boolean).join('\n');
  return parsePlanText(asText, fallbackName);
}

// ── PDF extractor (Node.js, no worker) ───────────────────────────────────────
async function extractTextFromPdfBuffer(buf) {
  // Dynamic import to avoid top-level issues with the ESM build
  const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
  // Disable worker for Node.js
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  const lines = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    let lastY = null;
    let currentLine = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(currentLine.join(''));
        currentLine = [];
      }
      currentLine.push(item.str);
      lastY = y;
    }
    if (currentLine.length) lines.push(currentLine.join(''));
    lines.push('');
  }
  return lines.join('\n');
}

// ── display ───────────────────────────────────────────────────────────────────
function displayPlan(plan, filePath) {
  const fname = basename(filePath);
  console.log('\n' + '═'.repeat(70));
  console.log(`FILE: ${fname}`);
  console.log(`PLAN NAME: ${plan.name}`);
  console.log(`DAYS FOUND: ${plan.days.length}`);
  if (plan.warnings.length) {
    console.log(`\nWARNINGS (${plan.warnings.length}):`);
    plan.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
  }

  for (const day of plan.days) {
    console.log(`\n  ┌─ ${day.label}  (week ${day.week})  — ${day.exercises.length} exercise(s)`);
    for (const ex of day.exercises) {
      const parts = [];
      if (ex.targetSets != null) parts.push(`sets=${ex.targetSets}`);
      if (ex.targetReps)         parts.push(`reps=${ex.targetReps}`);
      if (ex.targetWeight)       parts.push(`weight=${ex.targetWeight}`);
      if (ex.targetTime)         parts.push(`time=${ex.targetTime}`);
      if (ex.targetRest)         parts.push(`rest=${ex.targetRest}`);
      if (ex.notes)              parts.push(`notes="${ex.notes}"`);
      const missing = !ex.targetSets && !ex.targetReps && !ex.targetTime ? ' ⚠️ no targets' : '';
      console.log(`  │  ${ex.name}${missing}`);
      if (parts.length) console.log(`  │    → ${parts.join('  ')}`);
    }
    console.log('  └─');
  }
  console.log('═'.repeat(70));
}

// ── main ──────────────────────────────────────────────────────────────────────
const filePath = process.argv[2];
if (!filePath) { console.error('Usage: node scripts/test-parser.mjs <file>'); process.exit(1); }

const buf = await readFile(filePath);
const ext = extname(filePath).toLowerCase();
const fallbackName = basename(filePath).replace(/\.[^.]+$/, '');

let plan;
if (ext === '.docx') {
  const result = await mammoth.extractRawText({ buffer: buf });
  plan = parsePlanText(result.value, fallbackName);
} else if (ext === '.xlsx' || ext === '.xls') {
  plan = parseXlsxBuffer(buf, fallbackName);
} else if (ext === '.pdf') {
  const text = await extractTextFromPdfBuffer(buf);
  plan = parsePlanText(text, fallbackName);
  if (!text.trim()) plan.warnings.unshift('No text extracted — likely a scanned/image PDF.');
} else if (ext === '.txt' || ext === '.csv') {
  plan = parsePlanText(buf.toString('utf8'), fallbackName);
} else {
  console.error(`Unsupported extension: ${ext}`); process.exit(1);
}

displayPlan(plan, filePath);

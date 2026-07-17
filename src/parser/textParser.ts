import type { ParsedDay, ParsedExercise, ParsedPlan } from './types';
import { TIME_UNIT_FRAGMENT, formatTime } from '../lib/duration';

/**
 * Narrow format assumption (per build spec): a document is a sequence of
 * "day header" lines followed by "exercise" lines, optionally grouped under
 * "week" headers. Exercise lines look like `Name  3x8  135lb`. Anything that
 * doesn't fit is kept as a best-effort exercise line and flagged as a
 * warning so the confirm/edit screen can catch it.
 */

const BULLET_RE = /^[\s]*[-*•‣▪·]\s*|^\s*\d+[.)]\s+/;

const WEEK_RE = /^week\s*(\d+)\b\s*[:\-–]?\s*(.*)$/i;

const WEEKDAY_RE =
  /^(mon(day)?|tue(s|sday)?|wed(nesday)?|thu(rs|rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b/i;

const DAY_RE = /^day\s*(\d+)\b\s*[:\-–]?\s*(.*)$/i;

// "July 18", "Jul 14", "January 1st", "Dec 31, 2026" — calendar date headers
// used in personal training logs.
const CALENDAR_DATE_RE =
  /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?\b/i;

// "3x8", "3 x 8-10", "3 sets of 8", each optionally followed by a weight —
// either with an explicit separator ("x 135", "@ 135") or, when there's no
// separator token, a number that carries its own unit ("135lb") so it isn't
// confused with a stray trailing number.
const SET_REP_WEIGHT_RE =
  /(?<sets>\d+)\s*(?:x|×|sets?\s+of)\s*(?<reps>\d+(?:\s*-\s*\d+)?|amrap|max(?:imum)?)\s*(?:reps?)?(?:\s*(?:(?:x|×|@|at)\s*(?<weightA>\d+(?:[.,]\d+)?)\s*(?<unitA>lbs?|kgs?|kg|%)?|(?<weightB>\d+(?:[.,]\d+)?)\s*(?<unitB>lbs?|kgs?|kg|%)))?/i;

// "3x30s", "3 x 45 sec" — a sets multiplier over a duration instead of reps.
// The unit is mandatory here specifically so this doesn't also fire on
// plain rep counts like "3x8" (handled by SET_REP_WEIGHT_RE instead); tried
// before that pattern so "3x30s" isn't misread as 30 reps with a stray "s".
const SETS_TIME_RE = new RegExp(
  `(?<sets>\\d+)\\s*(?:x|×|sets?\\s+of)\\s*(?<time>\\d+(?:\\.\\d+)?)\\s*(?<timeUnit>${TIME_UNIT_FRAGMENT})\\b`,
  'i',
);

// A bare duration with no sets multiplier — "Plank 45s", "Wall Sit 1min".
const TIME_ONLY_RE = new RegExp(`(?<time>\\d+(?:\\.\\d+)?)\\s*(?<timeUnit>${TIME_UNIT_FRAGMENT})\\b(?:\\s*hold)?`, 'i');

// A rest prescription mentioned inline — "30s rest", "rest 90s", "rest: 2min".
const REST_RE = new RegExp(
  `(?:^|[\\s,;])(?:(\\d+(?:\\.\\d+)?)\\s*(${TIME_UNIT_FRAGMENT})\\s*rest\\b|rest\\s*(?:of|for)?\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*(${TIME_UNIT_FRAGMENT}))`,
  'i',
);

// "x10", "x 8-10", "x8/leg" — reps-only with no preceding sets count.
// \bx requires a word boundary so it doesn't fire on the "x" inside "3x8"
// (where "3" and "x" are both \w with no boundary between them).
const REPS_ONLY_RE =
  /\bx\s*(?<reps>\d+(?:\s*-\s*\d+)?)\s*(?:reps?)?\b(?:\s*\/\s*(?<side>leg|side|arm|hand))?/i;

// "Exercise Name: 5 reps", "Name: 4-5 reps", "Name: 3 rounds",
// "Sandbag Carries: 30 meters", "Farmer's Walk: 25m" — colon-separated count
// with an optional unit. Rep/round/flip units → targetReps; distance units →
// notes. Handles both plain counts and ranges. Anchored to end-of-line.
const COLON_COUNT_RE =
  /:\s*(?<count>\d+(?:\s*-\s*\d+)?)\s*(?<unit>reps?|rounds?|flips?|meters?|m\b|km\b|feet?|ft\b|yards?|yd\b)?\s*$/i;

const DISTANCE_UNIT_RE = /^(meters?|m|km|feet?|ft|yards?|yd)$/i;

/** Pulls an inline rest mention ("...,  30s rest") out of trailing/notes text, if present. */
function extractRest(text: string): { rest: string | null; remaining: string } {
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

function stripBullet(line: string): string {
  return line.replace(BULLET_RE, '').trim();
}

/**
 * Strips markdown formatting characters that AI-generated documents and some
 * word processors leave as literal text after extraction:
 *   **bold**  →  bold
 *   *italic*  →  italic
 *   #### heading  →  heading
 * Applied before header/exercise detection so "**Day 1:**" is correctly
 * recognised as a day header rather than failing the `^day` regex.
 */
function stripMarkdown(line: string): string {
  return line
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold** → bold
    .replace(/\*([^*]+)\*/g, '$1')     // *italic* → italic
    .replace(/^#+\s*/, '')             // ### heading → heading
    .replace(/\*+/g, '')               // remaining stray asterisks
    .trim();
}

/**
 * Converts MM:SS clock-time patterns to the parser's canonical time unit
 * vocabulary (s / min) so downstream regexes can match them.
 *
 * Only converts when the "minutes" portion is a single digit (0–9) — these
 * are unambiguously clock-time durations in a workout context (e.g. "1:30
 * rest" = 90 s). Two-digit "M:SS" patterns like "30:30" are almost always
 * work-rest interval notation (30 s on / 30 s off) and are left unchanged so
 * they appear in notes rather than being silently mis-classified.
 *
 * Also handles the PDF-column-spacing artefact "1: 30" (space after colon).
 */
function normalizeMMSS(line: string): string {
  // Convert single-digit-minute MM:SS to total seconds (or whole minutes when
  // it divides evenly) so TIME_UNIT_FRAGMENT can match the result cleanly.
  // e.g. "1:30" → "90s", "2:00" → "2min", "1:15" → "75s"
  // Two-digit patterns ("30:30", "45:15") are interval notation — left unchanged.
  return line.replace(/\b([0-9])\s*:\s*(\d{2})\b/g, (_, min, sec) => {
    const totalSecs = parseInt(min, 10) * 60 + parseInt(sec, 10);
    return totalSecs % 60 === 0 ? `${totalSecs / 60}min` : `${totalSecs}s`;
  });
}

/**
 * Strips invisible Unicode formatting characters that PDF-exported documents
 * (e.g. Google Docs → PDF) embed around every text run. These are
 * zero-width spaces, joiners, separators and similar glyphs that are
 * invisible to the eye but break every regex and bullet-strip pattern.
 *
 * Removed ranges:
 *   U+200B–U+200F  (zero-width space / non-joiner / joiner / etc.)
 *   U+2060–U+2064  (word joiner / invisible separator / invisible plus)
 *   U+FEFF         (byte-order mark / zero-width no-break space)
 *   U+2063         (invisible separator, common in Google Docs PDFs)
 */
function stripInvisibleChars(line: string): string {
  // eslint-disable-next-line no-control-regex
  return line.replace(/[\u200B-\u200F\u2060-\u2064\uFEFF]/g, '').trim();
}

/**
 * Normalises Unicode dashes to ASCII hyphens so rep-range regexes like
 * \d+-\d+ match "8–10" (en-dash) as well as "8-10" (hyphen).
 */
function normalizeDashes(line: string): string {
  return line
    .replace(/\u2013/g, '-') // en-dash
    .replace(/\u2014/g, '-'); // em-dash
}

/** Applies all pre-processing normalisations to a raw line before parsing. */
export function normalizeLine(raw: string): string {
  return normalizeDashes(normalizeMMSS(stripMarkdown(stripInvisibleChars(raw))));
}

/**
 * Exported for use by the section scanner.
 * True when the normalised line reads like a day/week/section header —
 * i.e. it would cause the text parser to open a new day bucket.
 */
export function looksLikeHeadingLine(line: string): boolean {
  if (!line || looksLikeTargetLine(line)) return false;
  return (
    WEEK_RE.test(line) ||
    DAY_RE.test(line) ||
    WEEKDAY_RE.test(line) ||
    CALENDAR_DATE_RE.test(line) ||
    looksLikeHeaderFallback(line) ||
    looksLikeSectionHeader(line)
  );
}

/** Exported for use by the section scanner. */
export function stripBulletExport(line: string): string {
  return stripBullet(line);
}

/** True if the line carries any recognizable target (reps, weight, or a duration). */
export function looksLikeTargetLine(line: string): boolean {
  return SET_REP_WEIGHT_RE.test(line) || SETS_TIME_RE.test(line) || TIME_ONLY_RE.test(line) || REPS_ONLY_RE.test(line);
}

function looksLikeHeaderFallback(line: string): boolean {
  if (looksLikeTargetLine(line)) return false;
  if (line.length > 45) return false;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  if (/[.!?]$/.test(line)) return false;
  return true;
}

const SECTION_KEYWORD_RE = /^(warm[\s-]?up|main\s*set|cool[\s-]?down|circuit|superset|finisher)\b/i;

/**
 * Stricter than looksLikeHeaderFallback — used once we're already inside a
 * day, where treating *every* short numberless line as a new section would
 * fragment a plain exercise list (e.g. a circuit with shared set/rest
 * timing instead of per-line numbers) into a run of bogus one-exercise
 * "days". Only promote when the line reads like an actual section label:
 * ALL CAPS, or a recognized workout section keyword.
 */
function looksLikeSectionHeader(line: string): boolean {
  if (!looksLikeHeaderFallback(line)) return false;
  if (SECTION_KEYWORD_RE.test(line)) return true;
  return /[A-Z]/.test(line) && line === line.toUpperCase();
}

function splitNameAndTrailing(line: string, matchIndex: number, matchLength: number): { name: string; trailing: string } {
  const name = line.slice(0, matchIndex).trim().replace(/[-:–,]+$/, '').trim();
  const trailing = line.slice(matchIndex + matchLength).trim().replace(/^[-:–,]+/, '').trim();
  return { name, trailing };
}

function baseExercise(rawLine: string): ParsedExercise {
  return {
    tempId: crypto.randomUUID(),
    name: '',
    targetSets: null,
    targetReps: null,
    targetWeight: null,
    targetTime: null,
    targetRest: null,
    notes: null,
    groupTempId: null,
    raw: rawLine,
  };
}

function parseExerciseLine(rawLine: string): ParsedExercise | null {
  // Normalise the line (markdown, dashes, MM:SS) before pattern matching.
  // rawLine is preserved verbatim in the exercise record for the confirm screen.
  const line = stripBullet(normalizeLine(rawLine));
  if (!line) return null;

  // "3x30s" — sets x a duration instead of reps. Tried before the reps
  // pattern below: the unit is mandatory here, so it only matches when a
  // time unit is actually present, but it still has to go first or
  // SET_REP_WEIGHT_RE would greedily read "30" as reps and leave a stray
  // "s" dangling.
  const setsTimeMatch = SETS_TIME_RE.exec(line);
  if (setsTimeMatch) {
    const g = setsTimeMatch.groups!;
    const { name, trailing } = splitNameAndTrailing(line, setsTimeMatch.index, setsTimeMatch[0].length);
    const { rest, remaining } = extractRest(trailing);
    return {
      ...baseExercise(rawLine),
      name: name || '(unnamed exercise)',
      targetSets: Number(g.sets),
      targetTime: formatTime(g.time, g.timeUnit),
      targetRest: rest,
      notes: remaining || null,
    };
  }

  // "3x8 135lb" — sets x reps, optionally with a weight.
  const repMatch = SET_REP_WEIGHT_RE.exec(line);
  if (repMatch) {
    const g = repMatch.groups!;
    const weight = g.weightA ?? g.weightB;
    const unit = g.unitA ?? g.unitB;
    const { name, trailing } = splitNameAndTrailing(line, repMatch.index, repMatch[0].length);
    const { rest, remaining } = extractRest(trailing);
    return {
      ...baseExercise(rawLine),
      name: name || '(unnamed exercise)',
      targetSets: Number(g.sets),
      targetReps: g.reps.replace(/\s*-\s*/, '-').toLowerCase(),
      targetWeight: weight ? `${weight}${unit ? unit.toLowerCase() : ''}` : null,
      targetRest: rest,
      notes: remaining || null,
    };
  }

  // "Plank 45s" / "Wall Sit 1min hold" — a bare duration, no sets multiplier.
  const timeOnlyMatch = TIME_ONLY_RE.exec(line);
  if (timeOnlyMatch) {
    const g = timeOnlyMatch.groups!;
    const { name, trailing } = splitNameAndTrailing(line, timeOnlyMatch.index, timeOnlyMatch[0].length);
    const { rest, remaining } = extractRest(trailing);
    return {
      ...baseExercise(rawLine),
      name: name || '(unnamed exercise)',
      targetTime: formatTime(g.time, g.timeUnit),
      targetRest: rest,
      notes: remaining || null,
    };
  }

  // "Archer Rows x10", "x8-10", "x8/leg" — reps only, no sets count.
  // Common in modern program templates that omit the sets prefix.
  const repsOnlyMatch = REPS_ONLY_RE.exec(line);
  if (repsOnlyMatch) {
    const g = repsOnlyMatch.groups!;
    const { name, trailing } = splitNameAndTrailing(line, repsOnlyMatch.index, repsOnlyMatch[0].length);
    const { rest, remaining } = extractRest(trailing);
    const reps = g.reps.replace(/\s*-\s*/, '-');
    const sideNote = g.side ? `per ${g.side}` : null;
    const notes = [sideNote, remaining].filter(Boolean).join(', ') || null;
    return {
      ...baseExercise(rawLine),
      name: name || '(unnamed exercise)',
      targetReps: reps,
      targetRest: rest,
      notes,
    };
  }

  // "Exercise Name: 5 reps", "Sandbag Carries: 30 meters" — colon-separated
  // count with an optional unit. Rep/round/flip targets go into targetReps;
  // distance targets (meters, km, feet, etc.) go into notes.
  const colonCountMatch = COLON_COUNT_RE.exec(line);
  if (colonCountMatch) {
    const name = line.slice(0, colonCountMatch.index).trim();
    if (name) {
      const { count, unit } = colonCountMatch.groups!;
      const isDistance = unit ? DISTANCE_UNIT_RE.test(unit) : false;
      return {
        ...baseExercise(rawLine),
        name,
        targetReps: isDistance ? null : count.replace(/\s*-\s*/, '-'),
        notes: isDistance ? `${count} ${unit}` : null,
      };
    }
  }

  // No recognizable target at all — still capture the line as a named
  // exercise with no targets, rather than silently dropping it.
  return { ...baseExercise(rawLine), name: line };
}

export function parsePlanText(text: string, fallbackName: string): ParsedPlan {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const days: ParsedDay[] = [];
  const warnings: string[] = [];
  let currentWeek = 1;
  let currentDay: ParsedDay | null = null;
  let dayOrder = 0;
  let planName = fallbackName;
  let sawAnyHeader = false;

  const ensureDay = (label: string, week: number) => {
    currentDay = {
      tempId: crypto.randomUUID(),
      week,
      label,
      exercises: [],
      groups: [],
    };
    days.push(currentDay);
    dayOrder += 1;
  };

  for (let i = 0; i < lines.length; i++) {
    // Normalise first, then strip bullets for header/exercise detection.
    // rawLine is kept for the exercise record; normalised+stripped is used
    // for all regex matching.
    const rawLine = lines[i];
    const line = stripBullet(normalizeLine(rawLine));
    if (!line) continue;

    // First non-empty line, if it doesn't look like a day/week/exercise line,
    // is treated as the plan's title.
    if (i === 0 && !WEEK_RE.test(line) && !DAY_RE.test(line) && !WEEKDAY_RE.test(line) && !CALENDAR_DATE_RE.test(line) && !looksLikeTargetLine(line)) {
      planName = line;
      continue;
    }

    const weekMatch = WEEK_RE.exec(line);
    if (weekMatch) {
      currentWeek = Number(weekMatch[1]);
      sawAnyHeader = true;
      const rest = weekMatch[2]?.trim();
      if (rest) {
        ensureDay(rest, currentWeek);
      }
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

    // Calendar date headers: "July 18", "Jul 14", "January 1st, 2026"
    if (CALENDAR_DATE_RE.test(line) && !looksLikeTargetLine(line)) {
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
      // A line that reads like an actual section label (ALL CAPS, or a
      // known keyword like "MAIN SET") starts a new day/section. Plain
      // short exercise names do NOT — otherwise a numberless exercise
      // list fragments into one bogus "day" per line.
      ensureDay(line, currentWeek);
      continue;
    }

    if (!currentDay) {
      ensureDay(`Day ${dayOrder + 1}`, currentWeek);
      warnings.push(`Couldn't find a day header before "${line}" — grouped under "${currentDay!.label}".`);
    }

    const exercise = parseExerciseLine(rawLine);
    if (exercise) {
      if (exercise.targetSets === null && exercise.targetReps === null && exercise.targetTime === null) {
        warnings.push(`Couldn't find sets/reps/time for "${exercise.name}" — check it on the next screen.`);
      }
      currentDay!.exercises.push(exercise);
    }
  }

  const nonEmptyDays = days.filter((d) => d.exercises.length > 0);

  if (!sawAnyHeader) {
    warnings.unshift(
      'No clear day headers were found. Exercises were grouped by best guess — please review the day breakdown below.',
    );
  }
  if (nonEmptyDays.length === 0) {
    warnings.unshift('No exercises could be parsed from this document. You can add them manually below.');
  }

  return {
    name: planName,
    days: nonEmptyDays,
    warnings,
  };
}

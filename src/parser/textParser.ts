import type { ParsedDay, ParsedExercise, ParsedPlan } from './types';

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

// "3x8", "3 x 8-10", "3 sets of 8", each optionally followed by a weight —
// either with an explicit separator ("x 135", "@ 135") or, when there's no
// separator token, a number that carries its own unit ("135lb") so it isn't
// confused with a stray trailing number.
const SET_REP_WEIGHT_RE =
  /(?<sets>\d+)\s*(?:x|×|sets?\s+of)\s*(?<reps>\d+(?:\s*-\s*\d+)?|amrap|max(?:imum)?)\s*(?:reps?)?(?:\s*(?:(?:x|×|@|at)\s*(?<weightA>\d+(?:\.\d+)?)\s*(?<unitA>lbs?|kgs?|kg|%)?|(?<weightB>\d+(?:\.\d+)?)\s*(?<unitB>lbs?|kgs?|kg|%)))?/i;

function stripBullet(line: string): string {
  return line.replace(BULLET_RE, '').trim();
}

function looksLikeHeaderFallback(line: string): boolean {
  if (SET_REP_WEIGHT_RE.test(line)) return false;
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

function parseExerciseLine(rawLine: string): ParsedExercise | null {
  const line = stripBullet(rawLine);
  if (!line) return null;

  const match = SET_REP_WEIGHT_RE.exec(line);
  if (!match) {
    // No recognizable sets/reps token — still capture the line as a named
    // exercise with no targets, rather than silently dropping it.
    return {
      tempId: crypto.randomUUID(),
      name: line,
      targetSets: null,
      targetReps: null,
      targetWeight: null,
      notes: null,
      raw: rawLine,
    };
  }

  const full = match[0];
  const g = match.groups!;
  const sets = g.sets;
  const reps = g.reps;
  const weight = g.weightA ?? g.weightB;
  const unit = g.unitA ?? g.unitB;
  const name = line.slice(0, match.index).trim().replace(/[-:–,]+$/, '').trim();
  const trailing = line.slice(match.index + full.length).trim().replace(/^[-:–,]+/, '').trim();

  return {
    tempId: crypto.randomUUID(),
    name: name || '(unnamed exercise)',
    targetSets: Number(sets),
    targetReps: reps.replace(/\s*-\s*/, '-').toLowerCase(),
    targetWeight: weight ? `${weight}${unit ? unit.toLowerCase() : ''}` : null,
    notes: trailing || null,
    raw: rawLine,
  };
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
    };
    days.push(currentDay);
    dayOrder += 1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = stripBullet(lines[i]);
    if (!line) continue;

    // First non-empty line, if it doesn't look like a day/week/exercise line,
    // is treated as the plan's title.
    if (i === 0 && !WEEK_RE.test(line) && !DAY_RE.test(line) && !WEEKDAY_RE.test(line) && !SET_REP_WEIGHT_RE.test(line)) {
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

    if (WEEKDAY_RE.test(line) && !SET_REP_WEIGHT_RE.test(line)) {
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

    const exercise = parseExerciseLine(line);
    if (exercise) {
      if (exercise.targetSets === null) {
        warnings.push(`Couldn't find sets/reps for "${exercise.name}" — check it on the next screen.`);
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

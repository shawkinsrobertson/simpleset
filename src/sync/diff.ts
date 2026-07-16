import type { Exercise, PlanDay, DiffKind, DiffEntry } from '../db/types';
import type { ParsedDay, ParsedExercise, ParsedPlan } from '../parser/types';

/** Lowercases, strips punctuation, and collapses whitespace so "Pull-Ups" === "Pull Ups". */
export function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  if (s.length < 2) {
    if (s.length === 1) set.add(s);
    return set;
  }
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

/** Dice coefficient over character bigrams — tolerant of typos, pluralization, and word reordering. */
export function similarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let overlap = 0;
  for (const g of ba) if (bb.has(g)) overlap++;
  return (2 * overlap) / (ba.size + bb.size || 1);
}

/** Below this, two names are treated as unrelated (plain new + removed, no rename prompt). */
export const FUZZY_RENAME_THRESHOLD = 0.5;

function formatTarget(
  sets: number | null,
  reps: string | null,
  time: string | null,
  weight: string | null,
  rest: string | null,
): string {
  let out = `${sets ?? '—'}×${reps ?? time ?? '—'}`;
  if (weight) out += ` @ ${weight}`;
  if (rest) out += ` (rest ${rest})`;
  return out;
}

function describeTargetChange(ex: Exercise, parsed: ParsedExercise): string | undefined {
  const oldStr = formatTarget(ex.targetSets, ex.targetReps, ex.targetTime, ex.targetWeight, ex.targetRest);
  const newStr = formatTarget(parsed.targetSets, parsed.targetReps, parsed.targetTime, parsed.targetWeight, parsed.targetRest);
  if (oldStr === newStr && (ex.notes ?? '') === (parsed.notes ?? '')) return undefined;
  return `${oldStr} → ${newStr}`;
}

export interface DayMatch {
  kind: 'matched' | 'new' | 'removed';
  existingDay?: PlanDay;
  parsedDay?: ParsedDay;
}

export interface ExerciseMatch {
  kind: DiffKind;
  dayLabel: string;
  /** Set whenever the destination day already exists (matched or removed day) — the exercise's dayId is already known. */
  existingDayId?: string;
  /** Set whenever this exercise belongs to a brand-new day — resolved to a real id at apply time. */
  parsedDay?: ParsedDay;
  existingExercise?: Exercise;
  parsedExercise?: ParsedExercise;
  detail?: string;
  similarity?: number;
}

export interface DiffResult {
  dayMatches: DayMatch[];
  exerciseMatches: ExerciseMatch[];
}

/** Matches new parsed days to existing days by label, not position — a 4-day split becoming 5 days shouldn't scramble identities. */
export function matchDays(existingDays: PlanDay[], parsedDays: ParsedDay[]): DayMatch[] {
  const usedExisting = new Set<string>();
  const usedParsedIdx = new Set<number>();
  const matches: DayMatch[] = [];

  parsedDays.forEach((pd, idx) => {
    const candidates = existingDays.filter(
      (ed) => !usedExisting.has(ed.id) && normalizeName(ed.label) === normalizeName(pd.label),
    );
    if (candidates.length === 0) return;
    // Duplicate labels: prefer whichever existing day was closest to this position originally.
    candidates.sort((a, b) => Math.abs(a.order - idx) - Math.abs(b.order - idx));
    const chosen = candidates[0];
    usedExisting.add(chosen.id);
    usedParsedIdx.add(idx);
    matches.push({ kind: 'matched', existingDay: chosen, parsedDay: pd });
  });

  parsedDays.forEach((pd, idx) => {
    if (usedParsedIdx.has(idx)) return;
    matches.push({ kind: 'new', parsedDay: pd });
  });

  existingDays.forEach((ed) => {
    if (usedExisting.has(ed.id)) return;
    matches.push({ kind: 'removed', existingDay: ed });
  });

  return matches;
}

/**
 * Matches exercises within a single (matched) day. Exact name match first —
 * using order as a tiebreaker when a name repeats within the day — then a
 * fuzzy pass over whatever's left, which only ever produces
 * "possibly_renamed" candidates (never auto-applied as a rename).
 */
export function matchExercisesForDay(
  existingExs: Exercise[],
  parsedExs: ParsedExercise[],
  dayLabel: string,
  existingDayId: string,
  parsedDay: ParsedDay,
): ExerciseMatch[] {
  const matches: ExerciseMatch[] = [];
  const usedExisting = new Set<string>();
  const usedParsedIdx = new Set<number>();

  const existingByName = new Map<string, Exercise[]>();
  existingExs.forEach((e) => {
    const key = normalizeName(e.name);
    if (!existingByName.has(key)) existingByName.set(key, []);
    existingByName.get(key)!.push(e);
  });
  existingByName.forEach((list) => list.sort((a, b) => a.order - b.order));

  const parsedByName = new Map<string, number[]>();
  parsedExs.forEach((p, idx) => {
    const key = normalizeName(p.name);
    if (!parsedByName.has(key)) parsedByName.set(key, []);
    parsedByName.get(key)!.push(idx);
  });

  for (const [key, existingList] of existingByName) {
    const parsedIdxList = parsedByName.get(key) ?? [];
    const pairCount = Math.min(existingList.length, parsedIdxList.length);
    for (let i = 0; i < pairCount; i++) {
      const ex = existingList[i];
      const pIdx = parsedIdxList[i];
      const parsed = parsedExs[pIdx];
      usedExisting.add(ex.id);
      usedParsedIdx.add(pIdx);
      const detail = describeTargetChange(ex, parsed);
      matches.push({
        kind: detail ? 'modified' : 'unchanged',
        dayLabel,
        existingDayId,
        parsedDay,
        existingExercise: ex,
        parsedExercise: parsed,
        detail,
      });
    }
  }

  const remainingExisting = existingExs.filter((e) => !usedExisting.has(e.id));
  const remainingParsedIdx = parsedExs.map((_, i) => i).filter((i) => !usedParsedIdx.has(i));

  const candidatePairs: { exId: string; pIdx: number; score: number }[] = [];
  for (const ex of remainingExisting) {
    for (const pIdx of remainingParsedIdx) {
      const score = similarity(ex.name, parsedExs[pIdx].name);
      if (score >= FUZZY_RENAME_THRESHOLD) candidatePairs.push({ exId: ex.id, pIdx, score });
    }
  }
  candidatePairs.sort((a, b) => b.score - a.score);

  const usedExisting2 = new Set<string>();
  const usedParsedIdx2 = new Set<number>();
  for (const pair of candidatePairs) {
    if (usedExisting2.has(pair.exId) || usedParsedIdx2.has(pair.pIdx)) continue;
    usedExisting2.add(pair.exId);
    usedParsedIdx2.add(pair.pIdx);
    const ex = remainingExisting.find((e) => e.id === pair.exId)!;
    matches.push({
      kind: 'possibly_renamed',
      dayLabel,
      existingDayId,
      parsedDay,
      existingExercise: ex,
      parsedExercise: parsedExs[pair.pIdx],
      similarity: pair.score,
    });
  }

  remainingExisting.forEach((ex) => {
    if (usedExisting2.has(ex.id)) return;
    matches.push({ kind: 'removed', dayLabel, existingDayId, existingExercise: ex });
  });
  remainingParsedIdx.forEach((pIdx) => {
    if (usedParsedIdx2.has(pIdx)) return;
    matches.push({ kind: 'new', dayLabel, existingDayId, parsedDay, parsedExercise: parsedExs[pIdx] });
  });

  return matches;
}

export function computeDiff(
  existingDays: PlanDay[],
  existingExercisesByDay: Map<string, Exercise[]>,
  parsedPlan: ParsedPlan,
): DiffResult {
  const dayMatches = matchDays(existingDays, parsedPlan.days);
  const exerciseMatches: ExerciseMatch[] = [];

  for (const dm of dayMatches) {
    if (dm.kind === 'matched') {
      const existingExs = existingExercisesByDay.get(dm.existingDay!.id) ?? [];
      exerciseMatches.push(
        ...matchExercisesForDay(existingExs, dm.parsedDay!.exercises, dm.parsedDay!.label, dm.existingDay!.id, dm.parsedDay!),
      );
    } else if (dm.kind === 'new') {
      dm.parsedDay!.exercises.forEach((p) =>
        exerciseMatches.push({ kind: 'new', dayLabel: dm.parsedDay!.label, parsedDay: dm.parsedDay, parsedExercise: p }),
      );
    } else if (dm.kind === 'removed') {
      const existingExs = existingExercisesByDay.get(dm.existingDay!.id) ?? [];
      existingExs.forEach((e) =>
        exerciseMatches.push({ kind: 'removed', dayLabel: dm.existingDay!.label, existingDayId: dm.existingDay!.id, existingExercise: e }),
      );
    }
  }

  return { dayMatches, exerciseMatches };
}

export function diffHasChanges(diff: DiffResult): boolean {
  return (
    diff.dayMatches.some((d) => d.kind !== 'matched') ||
    diff.exerciseMatches.some((e) => e.kind !== 'unchanged')
  );
}

export function needsResolution(diff: DiffResult): ExerciseMatch[] {
  return diff.exerciseMatches.filter((m) => m.kind === 'possibly_renamed');
}

export function toDiffSummary(diff: DiffResult, resolutions: Record<string, 'same' | 'different'>): DiffEntry[] {
  return diff.exerciseMatches.flatMap((m): DiffEntry[] => {
    if (m.kind === 'possibly_renamed') {
      const resolution = m.existingExercise ? resolutions[m.existingExercise.id] : undefined;
      if (resolution === 'same') {
        return [
          {
            kind: 'modified',
            dayLabel: m.dayLabel,
            exerciseName: m.parsedExercise!.name,
            detail: `Renamed "${m.existingExercise!.name}" → "${m.parsedExercise!.name}"`,
          },
        ];
      }
      if (resolution === 'different') {
        return [
          { kind: 'removed', dayLabel: m.dayLabel, exerciseName: m.existingExercise!.name },
          { kind: 'new', dayLabel: m.dayLabel, exerciseName: m.parsedExercise!.name },
        ];
      }
      // Unresolved — shouldn't reach apply, but keep the summary honest if it does.
      return [{ kind: 'possibly_renamed', dayLabel: m.dayLabel, exerciseName: m.parsedExercise!.name }];
    }
    return [
      {
        kind: m.kind,
        dayLabel: m.dayLabel,
        exerciseName: m.parsedExercise?.name ?? m.existingExercise?.name ?? '',
        detail: m.detail,
      },
    ];
  });
}

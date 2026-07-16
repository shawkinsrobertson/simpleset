import type { ParsedDay } from '../parser/types';

/** Clones a day (and its exercises/groups) with fresh temp ids, for the given week. */
export function cloneDayForWeek(day: ParsedDay, week: number, labelOverride?: string): ParsedDay {
  const groupTempIdMap = new Map<string, string>();
  const newGroups = day.groups.map((g) => {
    const newTempId = crypto.randomUUID();
    groupTempIdMap.set(g.tempId, newTempId);
    return { ...g, tempId: newTempId };
  });
  const newExercises = day.exercises.map((e) => ({
    ...e,
    tempId: crypto.randomUUID(),
    groupTempId: e.groupTempId ? (groupTempIdMap.get(e.groupTempId) ?? null) : null,
  }));
  return {
    tempId: crypto.randomUUID(),
    week,
    label: labelOverride ?? day.label,
    exercises: newExercises,
    groups: newGroups,
  };
}

/** Clones a day across `weekCount` additional weeks, starting at `startWeek`. */
export function repeatDayAcrossWeeks(day: ParsedDay, weekCount: number, startWeek: number): ParsedDay[] {
  const copies: ParsedDay[] = [];
  for (let i = 0; i < weekCount; i++) {
    copies.push(cloneDayForWeek(day, startWeek + i));
  }
  return copies;
}

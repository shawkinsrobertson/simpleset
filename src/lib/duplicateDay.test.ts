import { describe, expect, it } from 'vitest';
import { cloneDayForWeek, repeatDayAcrossWeeks } from './duplicateDay';
import type { ParsedDay } from '../parser/types';

function sampleDay(): ParsedDay {
  const groupTempId = 'group-1';
  return {
    tempId: 'day-1',
    week: 1,
    label: 'Day 1: Push',
    groups: [{ tempId: groupTempId, type: 'superset', label: 'Superset A' }],
    exercises: [
      {
        tempId: 'ex-1',
        name: 'Bench Press',
        targetSets: 3,
        targetReps: '8',
        targetWeight: '135lb',
        targetTime: null,
        targetRest: null,
        notes: null,
        groupTempId,
        raw: '',
      },
      {
        tempId: 'ex-2',
        name: 'Row',
        targetSets: 3,
        targetReps: '8',
        targetWeight: '100lb',
        targetTime: null,
        targetRest: null,
        notes: null,
        groupTempId,
        raw: '',
      },
    ],
  };
}

describe('cloneDayForWeek', () => {
  it('gives the clone fresh ids, distinct from the original', () => {
    const original = sampleDay();
    const clone = cloneDayForWeek(original, 2);

    expect(clone.tempId).not.toBe(original.tempId);
    expect(clone.week).toBe(2);
    expect(clone.label).toBe(original.label);
    expect(clone.exercises).toHaveLength(2);
    clone.exercises.forEach((e, i) => {
      expect(e.tempId).not.toBe(original.exercises[i].tempId);
      expect(e.name).toBe(original.exercises[i].name);
    });
  });

  it('remaps grouped exercises to the cloned group, not the original', () => {
    const original = sampleDay();
    const clone = cloneDayForWeek(original, 2);

    expect(clone.groups).toHaveLength(1);
    const newGroupId = clone.groups[0].tempId;
    expect(newGroupId).not.toBe(original.groups[0].tempId);
    expect(clone.exercises.every((e) => e.groupTempId === newGroupId)).toBe(true);
  });

  it('supports overriding the label', () => {
    const clone = cloneDayForWeek(sampleDay(), 3, 'Day 1 (copy)');
    expect(clone.label).toBe('Day 1 (copy)');
  });
});

describe('repeatDayAcrossWeeks', () => {
  it('produces one independent clone per week, each with unique ids', () => {
    const original = sampleDay();
    const copies = repeatDayAcrossWeeks(original, 3, 2);

    expect(copies).toHaveLength(3);
    expect(copies.map((d) => d.week)).toEqual([2, 3, 4]);

    const allTempIds = [
      ...copies.map((d) => d.tempId),
      ...copies.flatMap((d) => d.exercises.map((e) => e.tempId)),
      ...copies.flatMap((d) => d.groups.map((g) => g.tempId)),
    ];
    expect(new Set(allTempIds).size).toBe(allTempIds.length);
  });
});

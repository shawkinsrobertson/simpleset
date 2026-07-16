import { describe, expect, it } from 'vitest';
import { db } from './db';
import { confirmSync, createPlanFromParsed, getExerciseGroupsForPlan, getExistingStructureForDiff } from './repo';
import { computeDiff } from '../sync/diff';
import { buildApplyPlan } from '../sync/applyPlan';
import type { ParsedPlan } from '../parser/types';

function id() {
  return crypto.randomUUID();
}

function planWithSupersetDay(): ParsedPlan {
  const groupTempId = id();
  return {
    name: 'Group Sync Plan',
    warnings: [],
    days: [
      {
        tempId: id(),
        week: 1,
        label: 'Day 1: Push',
        groups: [{ tempId: groupTempId, type: 'superset', label: 'Superset A' }],
        exercises: [
          {
            tempId: id(),
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
            tempId: id(),
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
      },
    ],
  };
}

describe('groups survive a re-sync', () => {
  it('preserves manual grouping on a matched/modified exercise, and leaves a brand new exercise ungrouped', async () => {
    const plan = await createPlanFromParsed(planWithSupersetDay(), { sourceType: 'local', sourceFileName: 'plan.txt' });

    const groupsBefore = await getExerciseGroupsForPlan(plan.id);
    expect(groupsBefore).toHaveLength(1);
    const benchBefore = await db.exercises.where('planId').equals(plan.id).and((e) => e.name === 'Bench Press').first();
    expect(benchBefore?.groupId).toBe(groupsBefore[0].id);

    // Re-import: Bench Press gets a new target weight, and a brand new "Overhead Press" exercise appears.
    const updated: ParsedPlan = {
      name: 'Group Sync Plan',
      warnings: [],
      days: [
        {
          tempId: id(),
          week: 1,
          label: 'Day 1: Push',
          groups: [],
          exercises: [
            {
              tempId: id(),
              name: 'Bench Press',
              targetSets: 3,
              targetReps: '8',
              targetWeight: '145lb',
              targetTime: null,
              targetRest: null,
              notes: null,
              groupTempId: null,
              raw: '',
            },
            {
              tempId: id(),
              name: 'Row',
              targetSets: 3,
              targetReps: '8',
              targetWeight: '100lb',
              targetTime: null,
              targetRest: null,
              notes: null,
              groupTempId: null,
              raw: '',
            },
            {
              tempId: id(),
              name: 'Overhead Press',
              targetSets: 3,
              targetReps: '10',
              targetWeight: '65lb',
              targetTime: null,
              targetRest: null,
              notes: null,
              groupTempId: null,
              raw: '',
            },
          ],
        },
      ],
    };

    const structure = await getExistingStructureForDiff(plan.id);
    const diff = computeDiff(structure.days, structure.exercisesByDay, updated);
    const applyPlan = buildApplyPlan(plan.id, diff, {});
    await confirmSync(applyPlan, [], 'immediate', 'v2');

    const benchAfter = await db.exercises.where('planId').equals(plan.id).and((e) => e.name === 'Bench Press').first();
    expect(benchAfter?.targetWeight).toBe('145lb'); // target updated
    expect(benchAfter?.groupId).toBe(groupsBefore[0].id); // grouping untouched by the re-sync

    const overheadAfter = await db.exercises.where('planId').equals(plan.id).and((e) => e.name === 'Overhead Press').first();
    expect(overheadAfter?.groupId).toBeNull(); // brand new exercise from a re-sync is never auto-grouped

    const groupsAfter = await getExerciseGroupsForPlan(plan.id);
    expect(groupsAfter).toHaveLength(1); // no duplicate/stray groups created
  });
});

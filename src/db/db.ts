import Dexie, { type EntityTable } from 'dexie';
import type { Exercise, ExerciseGroup, LoggedSet, Plan, PlanDay, PlanVersion, PendingSync, Session } from './types';

export class SimpleSetDB extends Dexie {
  plans!: EntityTable<Plan, 'id'>;
  planDays!: EntityTable<PlanDay, 'id'>;
  exercises!: EntityTable<Exercise, 'id'>;
  exerciseGroups!: EntityTable<ExerciseGroup, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  loggedSets!: EntityTable<LoggedSet, 'id'>;
  planVersions!: EntityTable<PlanVersion, 'id'>;
  pendingSyncs!: EntityTable<PendingSync, 'id'>;

  constructor() {
    super('simpleset');
    this.version(1).stores({
      plans: 'id, isActive, importDate',
      planDays: 'id, planId, [planId+order]',
      exercises: 'id, planId, dayId, [dayId+order]',
      sessions: 'id, planId, dayId, date, status',
      loggedSets: 'id, sessionId, exerciseId, timestamp',
    });

    this.version(2)
      .stores({
        plans: 'id, isActive, importDate',
        planDays: 'id, planId, archived, [planId+order]',
        exercises: 'id, planId, dayId, archived, [dayId+order]',
        sessions: 'id, planId, dayId, date, status',
        loggedSets: 'id, sessionId, exerciseId, timestamp',
        planVersions: 'id, planId, importedAt',
        pendingSyncs: 'id, planId',
      })
      .upgrade(async (tx) => {
        await tx.table('plans').toCollection().modify((p) => {
          p.sourceModifiedTime = p.sourceModifiedTime ?? null;
        });
        await tx.table('planDays').toCollection().modify((d) => {
          d.archived = d.archived ?? false;
        });
        await tx.table('exercises').toCollection().modify((e) => {
          e.archived = e.archived ?? false;
        });
        await tx.table('loggedSets').toCollection().modify((s) => {
          s.targetSetsAtLog = s.targetSetsAtLog ?? null;
          s.targetRepsAtLog = s.targetRepsAtLog ?? null;
          s.targetWeightAtLog = s.targetWeightAtLog ?? null;
        });
      });

    this.version(3)
      .stores({
        plans: 'id, isActive, importDate',
        planDays: 'id, planId, archived, [planId+order]',
        exercises: 'id, planId, dayId, archived, [dayId+order]',
        sessions: 'id, planId, dayId, date, status',
        loggedSets: 'id, sessionId, exerciseId, timestamp',
        planVersions: 'id, planId, importedAt',
        pendingSyncs: 'id, planId',
      })
      .upgrade(async (tx) => {
        await tx.table('exercises').toCollection().modify((e) => {
          e.targetTime = e.targetTime ?? null;
          e.targetRest = e.targetRest ?? null;
        });
        await tx.table('loggedSets').toCollection().modify((s) => {
          s.timeSeconds = s.timeSeconds ?? null;
          s.targetTimeAtLog = s.targetTimeAtLog ?? null;
          s.targetRestAtLog = s.targetRestAtLog ?? null;
        });
      });

    this.version(4)
      .stores({
        plans: 'id, isActive, importDate',
        planDays: 'id, planId, archived, [planId+order]',
        exercises: 'id, planId, dayId, archived, groupId, [dayId+order]',
        exerciseGroups: 'id, planId, dayId, [dayId+order]',
        sessions: 'id, planId, dayId, date, status',
        loggedSets: 'id, sessionId, exerciseId, timestamp',
        planVersions: 'id, planId, importedAt',
        pendingSyncs: 'id, planId',
      })
      .upgrade(async (tx) => {
        await tx.table('exercises').toCollection().modify((e) => {
          e.groupId = e.groupId ?? null;
        });
      });
  }
}

export const db = new SimpleSetDB();

export function newId(): string {
  return crypto.randomUUID();
}

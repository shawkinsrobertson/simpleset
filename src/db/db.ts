import Dexie, { type EntityTable } from 'dexie';
import type { Exercise, LoggedSet, Plan, PlanDay, Session } from './types';

export class SimpleSetDB extends Dexie {
  plans!: EntityTable<Plan, 'id'>;
  planDays!: EntityTable<PlanDay, 'id'>;
  exercises!: EntityTable<Exercise, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  loggedSets!: EntityTable<LoggedSet, 'id'>;

  constructor() {
    super('simpleset');
    this.version(1).stores({
      plans: 'id, isActive, importDate',
      planDays: 'id, planId, [planId+order]',
      exercises: 'id, planId, dayId, [dayId+order]',
      sessions: 'id, planId, dayId, date, status',
      loggedSets: 'id, sessionId, exerciseId, timestamp',
    });
  }
}

export const db = new SimpleSetDB();

export function newId(): string {
  return crypto.randomUUID();
}

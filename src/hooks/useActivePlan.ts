import { getActivePlan } from '../db/repo';
import type { Plan } from '../db/types';
import { useLiveValue } from './useLiveValue';

export function useActivePlan(): { loading: boolean; plan: Plan | undefined } {
  const { loading, value } = useLiveValue(() => getActivePlan(), []);
  return { loading, plan: value };
}

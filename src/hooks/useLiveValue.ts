import { useLiveQuery } from 'dexie-react-hooks';

/**
 * Thin wrapper around dexie-react-hooks' useLiveQuery that makes "still
 * loading" distinguishable from "resolved to undefined/falsy" — the two are
 * otherwise both just `undefined` from useLiveQuery, which is indistinguishable
 * once the query legitimately resolves to nothing (e.g. no active plan).
 */
export function useLiveValue<T>(querier: () => Promise<T>, deps: unknown[]): { loading: boolean; value: T | undefined } {
  const result = useLiveQuery(async () => ({ value: await querier() }), deps);
  return { loading: result === undefined, value: result?.value };
}
